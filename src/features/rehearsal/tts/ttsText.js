// «Текст для диктора» (владелец 2026-11-25: «у ведущих не чувствуется, что они закончили фразу, она будто обрывается»). У реплики два текста:
//  • text — чистый, без «. … ! — –» (правило каталога, rehearsalLines.test.js): подпись на экране, аудит «текст изменён» (said), проверка сценария, разметка рта, привязки «момент слова»;
//  • tts  — тот же текст СО ЗНАКАМИ ПРЕПИНАНИЯ: только он уходит в ElevenLabs. По знакам модель понимает, где кончается мысль, и опускает голос; без конечного знака фраза «обрывается».
// tts обязан отличаться от text ТОЛЬКО знаками и регистром букв: слова те же и в том же порядке (ttsProblem). Тогда тайминги слов от ElevenLabs («Отлично!» — слово со знаком) ложатся на слова чистого
// текста один к одному: рот (wordLaneVisemes.mouthTrack сверяет ЧИСЛО слов) и привязки «запускаю / шкала / пока» (pitrace/raceLineWord.js, boss/lineWordAt.js — ищут начало слова без учёта регистра) не ломаются.
// Знак отдельным «словом» (тире между пробелами) запрещён: ElevenLabs вернул бы его отдельным словом, и число слов разошлось бы.
// Откуда берётся текст диктора (dictorText): своя правка владельца в настройках реплики (поле tts записи rotate_cat_lines, карточка реплики на «Таймлайне игры») → tts каталога (raceLines.js, miaLines.js)
// → чистый текст + точка (если он не кончается на . … ! ? :). open: true в каталоге — «фраза продолжается» («это значит» + слово): точка не добавляется, следующая реплика в контекст не идёт.
// Теги eleven_v3 («[смеётся]») сюда НЕ пишутся: модель по умолчанию (multilingual_v2) прочитала бы их вслух, а проверка слов их и не пропустит. Чистые функции без React.
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { MIA_LINES } from '../../pitrace/mia/miaLines.js'

const CATALOG = [...RACE_LINES, ...MIA_LINES]
export const TTS_OF = Object.fromEntries(CATALOG.filter(l => l.tts).map(l => [l.id, l.tts]))
/** Реплики, после которых фраза продолжается словом (точки в конце нет): каталог (open: true) и «Начни с» репетиции */
export const OPEN_IDS = new Set([...CATALOG.filter(l => l.open).map(l => l.id), 'rh_blind_hint_pre'])
export const isOpenLine = id => OPEN_IDS.has(id)

const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu
const clean = s => String(s ?? '').trim()
const tokens = s => clean(s).split(/\s+/).filter(Boolean)
/** Слово без знаков по краям и в нижнем регистре; знаки ВНУТРИ слова («кое-кто», «по-английски») остаются */
export const bareWord = w => String(w ?? '').replace(EDGE, '').toLowerCase()
/** Слова текста для сверки: [«встряхнём», «память», …]; знак отдельным куском даёт пустую строку */
export const bareWords = s => tokens(s).map(bareWord)

/** Чем tts не подходит к text — фраза для человека; подходит (или tts пустой) — null */
export function ttsProblem(text, tts) {
  const want = tokens(text), got = tokens(tts)
  if (!got.length) return null
  const lone = got.find(w => !bareWord(w))
  if (lone) return `знак «${lone}» стоит отдельно — приклей его к слову (или убери): диктор должен получить те же слова, что в тексте реплики`
  if (/[[\]<>{}]/.test(tts)) return 'скобки и теги в тексте диктора не поддерживаются: обычная модель прочитает их вслух'
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    const a = bareWord(want[i]), b = bareWord(got[i])
    if (a === b) continue
    if (i >= want.length) return `лишнее слово «${got[i]}» — текст для диктора может отличаться от текста реплики только знаками препинания и регистром букв`
    if (i >= got.length) return `не хватает слова «${want[i]}» — текст для диктора может отличаться от текста реплики только знаками препинания и регистром букв`
    return `слово № ${i + 1}: в реплике «${want[i]}», у диктора «${got[i]}» — менять можно только знаки препинания и регистр букв (сами слова правятся в поле «Текст реплики»)`
  }
  return null
}

/** Конечный знак по умолчанию: текст не кончается на . … ! ? : — добавляется точка (голос опускается в конце фразы) */
export const withEnd = text => { const t = clean(text); return !t || /[.…!?:]$/.test(t) ? t : `${t}.` }

/** Свой текст диктора из записи настроек, если он годится к её тексту; иначе null */
export const ownTts = line => { const t = clean(line?.tts); return t && !ttsProblem(line?.text, t) ? t : null }

/**
 * Что уйдёт в ElevenLabs для реплики id. line — запись реплики из настроек ({ text, tts }); text — её текущий чистый текст (по умолчанию line.text).
 * Свой tts владельца → tts каталога (оба — только если слова совпадают с текстом: текст правили в админке, а tts остался от прежнего — он не используется) → текст + точка (у «продолжающихся» — как есть).
 */
export function dictorText(id, line, text = line?.text) {
  const t = clean(text)
  if (!t) return ''
  const own = clean(line?.tts)
  if (own && !ttsProblem(t, own)) return own
  const cat = TTS_OF[id]
  if (cat && !ttsProblem(t, cat)) return cat
  return isOpenLine(id) ? t : withEnd(t)
}

/** Откуда текст диктора: 'own' — правка владельца, 'catalog' — из каталога кода, 'auto' — чистый текст с точкой, 'open' — как есть (фраза продолжается) */
export function dictorSource(id, line, text = line?.text) {
  const t = clean(text), own = clean(line?.tts)
  if (own && !ttsProblem(t, own)) return 'own'
  if (TTS_OF[id] && !ttsProblem(t, TTS_OF[id])) return 'catalog'
  return isOpenLine(id) ? 'open' : 'auto'
}
