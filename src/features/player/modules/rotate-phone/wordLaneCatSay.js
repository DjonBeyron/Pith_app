import { playWordSlot, hasWordSlot, wordSlotInfo } from './wordLaneClips.js'
import { speakText } from './wordLaneVoice.js'
import { openCatVoice } from './wordLaneCatVoiceLog.js'
import { lineKey, lineMs, LINE_PAUSE_MS } from './wordLaneCatLines.js'
import { mouthTrack } from './wordLaneVisemes.js'
import { catDebug } from './wordLaneCatDebug.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'

// Запуск реплики кота (useCatLines.js решает КОГДА — кулдаун, «не накладываются»; здесь — КАК): звук из слота, рот по дорожке, микрофон «не слушает», журнал отладки. Чистая функция — все зависимости приходят
// аргументами, проверяется тестами.
//  • Нет озвучки / звук не подготовлен — рот не двигается (звука нет), реплика остаётся подписью; в журнал уходит cat-line-silent с причиной.
//  • voice: 'synth' — слот не успел подготовиться за LINE_WAIT_MS (wordLaneLineGate.js, useCatLines): реплику говорит голос системы (на iPhone без жеста он тоже может молчать — исход пишется). Каждая реплика в первые 15 с игры
//    оставляет строку «[cat-voice] …» (wordLaneCatVoiceLog.js): источник, слот, исход play(), userActivation, мс с тапа.
//  • Голова спрятана — сначала выскакивает (пружина идёт 0,55 с), звук и рот стартуют через CAT_RISE_MS, иначе первые слова кот говорит «из-под экрана».
//  • Пока реплика звучит, открыто «окно речи» (gameMicHold.holdFor): по настройке игры дорожка микрофона на это время глушится и аудиосессия переключается — режимы проверки на iPhone (ducking).
//  • Дорожка рта — по таймингам слов озвучки, нет их — по тексту на всю длительность реплики (mouthTrack); длина озвучки (line.duration) ставит тайминги по долям файла, тишина в начале файла остаётся тишиной.
export const CAT_RISE_MS = 260

/** → { ms (длительность реплики), rise (задержка звука, мс), voiced (будет ли звук), timer (таймер старта или 0) } */
export function startCatLine({
  id, line, rate = 1, catApi = null, listenerRef = null, has = hasWordSlot, play = playWordSlot, say = speakText, slotOf = wordSlotInfo, open = openCatVoice,
  setTimer = setTimeout, log = catDebug, hold = gameMicHold, voice = 'slot', waitedMs = 0, why = null,
}) {
  const ms = lineMs(line, rate)
  const api = () => catApi?.current
  const key = lineKey(id)
  const synth = voice === 'synth' && !!line.text
  const ready = synth || (!!line.url && has(key))
  if (!ready) {
    const reason = line.url ? 'no-slot' : 'no-url'
    log('cat-line-silent', { id, reason })
    open({ id, source: 'none', slot: line.url ? slotOf(key) : null, waitedMs, why: reason === 'no-url' ? 'у реплики нет озвучки (url)' : 'слот не подготовлен' })()
    api()?.peek?.(ms + 400)
    return { ms, rise: 0, voiced: false, timer: 0 }
  }
  const rise = api()?.isUp?.() === false ? CAT_RISE_MS : 0 // голова спрятана — сначала выскочить
  listenerRef?.current?.mute?.(rise + ms + LINE_PAUSE_MS)
  const speak = () => { api()?.speak?.(mouthTrack(line.text, ms, line.words, line.duration), ms, { id }); hold?.holdFor?.(ms) }
  const silent = reason => { log('cat-line-silent', { id, reason }); api()?.peek?.(ms + 400) }
  const go = () => {
    if (synth) {
      const done = open({ id, source: 'synth', slot: slotOf(key), waitedMs, why })
      if (say(line.text, 'ru-RU', done)) speak()
      else { done({ play: 'rejected', error: 'speak() не запустился' }); silent('no-synth') }
      return
    }
    const done = open({ id, source: 'slot', slot: slotOf(key), waitedMs, why })
    if (play(key, done)) speak()
    else { done({ play: 'rejected', error: 'слот не сыграл' }); silent('no-slot') }
  }
  if (!rise) { go(); return { ms, rise, voiced: true, timer: 0 } }
  api().peek(rise + ms + 400)
  return { ms, rise, voiced: true, timer: setTimer(go, rise) }
}
