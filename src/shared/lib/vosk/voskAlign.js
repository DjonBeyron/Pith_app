// Разметка рта по словам для СВОЕГО файла озвучки реплики Пита / Мии (карточка реплики на «Таймлайне игры», admin/speech/raceLineActions.js). У своего файла нет таймингов слов (их отдаёт только
// ElevenLabs вместе с озвучкой), и рот шёл по тексту без привязки к звуку. Здесь файл размечается в браузере: Vosk слушает запись «по известному тексту» и отдаёт времена слов.
// Итог — тот же формат, что у озвучки ElevenLabs (words: [{ w, t, e }], секунды с сотыми, слово как в тексте со знаками), поэтому игра свой файл от озвучки не отличает (рот — wordLaneVisemes.mouthTrack).
// У слова есть ещё метка a ('v' Vosk / 'f' достроено / 'l' по громкости): игра её не читает, по ней карточка показывает статус разметки после перезагрузки (voskAlignFill.alignInfo).
// Шаги: декодировать файл (voskAlignRun.decodeAudio) → голосовые участки по громкости (voskAlignFill) → слова текста и словарь (voskAlignText) → модель языка реплики и распознавание буфера
// (voskAlignRun) → сопоставить итог со словами текста (matchTokens) → достроить ненайденные (fillWords) → проверить гарантии (checkWords).
// НАДЁЖНОСТЬ: любой сбой движка (нет модели, не успел, ошибка воркера) не роняет разметку — слова раскладываются по громкости записи ('level'); голоса не видно — 'even' (равномерно: то же, что рот
// делает и без разметки, поэтому вызывающий в этом случае тайминги не сохраняет). Не декодируется сам файл — ошибка наружу (размечать нечего).
import { alignTokens, alignGrammar, matchTokens, textLang } from './voskAlignText.js'
import { rmsLevels, voiceSpans, fillWords, checkWords, APPROX_BELOW } from './voskAlignFill.js'
import { decodeAudio, alignModel, recognizeBuffer, RECOGNIZE_TIMEOUT_MS } from './voskAlignRun.js'

export const LOOSE_EXTRA = 0.4 // лишних слов у Vosk больше этой доли услышанного — он слышит не тот текст

const quote = list => list.map(w => `«${w}»`).join(', ')
export { alignLine } from './voskAlignFill.js'

/** Итог распознавания + слова текста → результат разметки (чистая часть: без движка). vosk — сырые слова Vosk или null (движок не сработал); why — почему не сработал */
export function buildAlign({ text, lang = textLang(text), vosk = null, why = '', spans = [], duration }) {
  const tokens = alignTokens(text, lang), total = tokens.length
  const notes = []
  if (!total) return { words: null, found: 0, total: 0, method: 'even', approx: false, missing: [], notes: ['в тексте нет слов — размечать нечего'] }
  const m = vosk ? matchTokens(tokens, vosk) : { times: tokens.map(() => null), found: 0, extra: 0, heard: 0 }
  const { words, method } = fillWords(tokens, m.times, spans, duration)
  const found = words.filter(w => w.a === 'v').length, missing = words.filter(w => w.a !== 'v').map(w => w.w)
  const loose = m.heard > 0 && m.extra / m.heard > LOOSE_EXTRA
  const approx = method !== 'vosk' && (found < total * APPROX_BELOW || loose)
  if (why) notes.push(why)
  const unknown = tokens.filter(t => !t.keys.length).map(t => t.w)
  if (unknown.length) notes.push(`модель (${lang === 'ru' ? 'русская' : 'английская'}) не знает такое письмо: ${quote(unknown)} — расставлены по соседям`)
  if (vosk && !m.heard) notes.push('Vosk не узнал в записи ни одного слова текста')
  if (loose) notes.push(`Vosk услышал ${m.extra} лишних слов из ${m.heard} — в записи, похоже, не совсем этот текст`)
  if (method === 'even') notes.push('голоса в записи не видно — разметка была бы равномерной, как без неё')
  const bad = checkWords(words, duration, total)
  if (bad.length) return { words: null, found: 0, total, method: 'even', approx: false, missing: tokens.map(t => t.w), notes: [...notes, `разметка не прошла проверку: ${bad[0]}`] }
  return { words: method === 'even' ? null : words, found, total, method, approx, missing, notes }
}

/**
 * Разметить запись. src — File / Blob / ArrayBuffer; text — текст реплики. onStep(текст) — ход для человека.
 * → { words (формат реплики или null), found, total, method: 'vosk' | 'vosk+fill' | 'level' | 'even', approx, missing, notes, duration, lang, ms, run (как отработал движок: { ms, by, events } или null) }. Бросает только если файл не декодируется.
 * Зависимости (decode, getModel, recognize) подставляются в тестах.
 */
export async function alignAudio(src, text, { onStep = () => {}, decode = decodeAudio, getModel = alignModel, recognize = recognizeBuffer, timeoutMs = RECOGNIZE_TIMEOUT_MS, now = () => Date.now() } = {}) {
  const t0 = now()
  const data = src instanceof ArrayBuffer ? src : await src.arrayBuffer()
  const pcm = await decode(data)
  const { levels, step } = rmsLevels(pcm.samples, pcm.rate)
  const spans = voiceSpans(levels, step)
  const lang = textLang(text), grammar = alignGrammar(alignTokens(text, lang))
  let vosk = null, why = '', run = null
  if (!grammar) why = 'в тексте нет слов, которые знает модель Vosk'
  else {
    let held = null
    try {
      held = await getModel(lang, { onStep })
      onStep('слушаю запись (Vosk)…')
      run = await recognize(held.model, pcm.samples, pcm.rate, grammar, { timeoutMs })
      vosk = run.words ?? []
    } catch (e) { why = `Vosk не сработал: ${e?.message ?? e}` } finally { try { held?.release?.() } catch { /* модель уже отпущена */ } }
  }
  const r = buildAlign({ text, lang, vosk, why, spans, duration: pcm.duration })
  return { ...r, duration: pcm.duration, lang, ms: now() - t0, run: run ? { ms: run.ms, by: run.by, events: run.events } : null }
}
