// «Дубль и зеркало» в сценарии репетиции: то, что соединяет модуль mirror/ (запись, измерения, заметка, сравнение на дорожках) с игрой. Чистые функции и сборка данных для экрана — без React:
//  • makeMirrorDictor — диктор из кусков библиотеки слов с теми же длинами и паузами, что в игре (makeLib / estChunkMs, скорость голоса урока), тайминги слов — dictorPlan; play() играет куски по плану
//    теми же слотами и голосом, что диктор ступеней (playWordSlot → speakWord, без голоса системы) и открывает «окно речи» (gameMicHold), cancel() гасит таймеры (вышли с экрана);
//  • takeWordsOf — слова слушателей игры (мс от start() каждого слушателя, wordLaneListen.words) → шкала записи (мс от её старта): слушатель стартовал раньше записи (под плашкой «Дубль…»), сдвиг = старт слушателя − старт записи;
//  • buildMirror — всё для сравнения на дорожках: { dictor, student, measure, note, tempo } (rng — поток от семени плана: заметка при равных измерениях — один из вариантов, mirrorNotes.js); записи нет (сбой) — student и measure null, заметка «Запись не получилась…»;
//  • tempoLabel — подпись темпа на экране итога («×1.3» / «как у Пита» / «—»).
import { measureTake, dictorPlan } from './mirror/mirrorMeasure.js'
import { noteFor } from './mirror/mirrorNotes.js'
import { makeLib, libRow } from '../player/modules/rotate-phone/wordLaneLib.js'
import { playWordSlot } from '../player/modules/rotate-phone/wordLaneClips.js'
import { speakWord } from '../player/modules/rotate-phone/wordLaneVoice.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { gameMicHold } from '../../shared/lib/gameMicHold.js'

export const DICTOR_GAP_MS = 80   // пауза между кусками диктора, как у say() игры
export const DICTOR_TAIL_MS = 250 // после последнего куска ждём затухания, потом play() считается законченным

/** Диктор сравнения: { words (мс от начала голоса), durationMs, leadMs, play(): Promise<void>, cancel() }. Зависимости подставляются в тестах */
export function makeMirrorDictor({ chunks, rate = 1, lib = makeLib(chunks), row = libRow, play = playWordSlot, speak = speakWord, hold = gameMicHold, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const k = rate > 0 ? rate : 1
  const plan = dictorPlan(chunks, chunks.map((c, i) => ({ ms: (lib(i)?.ms ?? estChunkMs(c)) / k, lead: (lib(i)?.lead ?? 0) / k })), DICTOR_GAP_MS)
  const timers = new Set()
  const waiting = new Set()
  const later = (fn, ms) => { const id = setTimer(() => { timers.delete(id); fn() }, Math.max(0, ms)); timers.add(id) }
  const say = chunk => { const r = row(chunk); if (!(r && play(r.key))) speak(chunk) }
  return {
    words: plan.words,
    durationMs: plan.durationMs,
    leadMs: plan.leadMs,
    play() {
      const total = plan.leadMs + plan.durationMs + DICTOR_TAIL_MS
      hold?.holdFor(total)
      plan.plays.forEach(p => later(() => say(p.chunk), p.at))
      return new Promise(resolve => { waiting.add(resolve); later(() => { waiting.delete(resolve); resolve() }, total) })
    },
    /** Вышли из стадии зеркала: звук кусков, что ещё не включился, не включится; ждущий play() завершается */
    cancel() { timers.forEach(clearTimer); timers.clear(); waiting.forEach(r => r()); waiting.clear() },
  }
}

/** Слова слушателей [{ words: [{ word, conf, start, end }] (мс от start()), startedAt }] → слова записи { word, conf, start, end } в мс от её старта recAt (по времени начала). Слова целиком до старта записи отбрасываются */
export function takeWordsOf(listeners, recAt) {
  const out = []
  for (const l of listeners) {
    const shift = (Number(l.startedAt) || 0) - (Number(recAt) || 0)
    for (const w of l.words ?? []) {
      const start = Math.round(w.start + shift)
      const end = Math.round(w.end + shift)
      if (end > 0) out.push({ word: w.word, conf: w.conf, start: Math.max(0, start), end })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/** Всё для «зеркала» на дорожках: take — { url, durationMs, rms } | null; words — takeWordsOf; dictor — makeMirrorDictor; dictorRms — громкость файлов диктора или null */
export function buildMirror({ chunks, take, words = [], dictor, dictorRms = null, rng = null }) {
  const student = take ? { url: take.url, blob: take.blob ?? null, words, durationMs: take.durationMs, rms: take.rms, unit: 'ms' } : null
  const measure = student ? measureTake({ dictor: { words: dictor.words, durationMs: dictor.durationMs, rms: dictorRms ?? undefined }, student, chunks }) : null
  return { dictor, student, measure, note: noteFor(measure, chunks, rng), tempo: measure?.tempo ?? null }
}

export const TEMPO_SAME = 0.1 // разница темпа меньше этой доли — «как у Пита»

/** Темп дубля для итога: во сколько раз твоя речь длиннее речи Пита по тем же кускам (без пауз). «×1.3» — медленнее на 30 %, «×0.8» — быстрее; |1 − темп| < 0,1 — «как у Пита»; нет темпа (записи нет) — «—» */
export function tempoLabel(tempo) {
  if (!(tempo > 0)) return '—'
  return Math.abs(Math.round((1 - tempo) * 100)) / 100 < TEMPO_SAME ? 'как у Пита' : `×${(Math.round(tempo * 10) / 10).toFixed(1)}`
}
