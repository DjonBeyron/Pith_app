import { playWordSlot, hasWordSlot, wordSlotInfo, wordBufferMs } from './wordLaneClips.js'
import { openCatVoice } from './wordLaneCatVoiceLog.js'
import { lineKey, lineMs, LINE_PAUSE_MS } from './wordLaneCatLines.js'
import { mouthTrack } from './wordLaneVisemes.js'
import { catDebug } from './wordLaneCatDebug.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'

// Запуск реплики кота (useCatLines.js решает КОГДА — кулдаун, «не накладываются»; здесь — КАК): звук из слота, рот по дорожке, микрофон «не слушает», журнал отладки. Чистая функция — все зависимости приходят
// аргументами, проверяется тестами.
//  • Нет озвучки / звук не подготовлен — рот не двигается (звука нет), реплика остаётся подписью; в журнал уходит cat-line-silent с причиной.
//  • voice: 'none' — слот не успел подготовиться за LINE_WAIT_MS (wordLaneLineGate.js, useCatLines). Голоса системы в игре НЕТ (на iPhone синтез захватывает аудиосессию и глушит микрофон на секунды): реплика остаётся
//    подписью, рот кота двигается по тексту (звука нет — микрофон не глушим), в журнал уходит «[cat-voice] … источник=нет (синтез запрещён)» и cat-line-silent { reason: 'no-synth' }. Каждая реплика в первые 15 с игры
//    оставляет строку «[cat-voice] …» (wordLaneCatVoiceLog.js): источник, слот, исход play(), userActivation, мс с тапа.
//  • Звук — AudioBuffer через Web Audio (wordLaneBuffers.js): «слот готов» = буфер декодирован, длительность реплики (окно речи микрофона, конец рта) берётся по буферу. Рот кота открывается по ФАКТУ старта источника (колбэк
//    onStart слота), а не по таймеру до него: контекст 'running' — в тот же миг; контекст прерван — после resume() (≤ 300 мс), не стартовал вовсе — реплика остаётся подписью (cat-line-silent, причина в «[cat-voice]»).
//    У запасного <audio>-слота «старт» — вызов play() (настоящего старта не узнать), как и раньше.
//  • Голова спрятана — сначала выскакивает (пружина идёт 0,55 с), звук и рот стартуют через CAT_RISE_MS, иначе первые слова кот говорит «из-под экрана».
//  • Пока реплика звучит, открыто «окно речи» (gameMicHold.holdFor): по настройке игры дорожка микрофона на это время глушится и аудиосессия переключается — режимы проверки на iPhone (ducking).
//  • Дорожка рта — по таймингам слов озвучки, нет их — по тексту на всю длительность реплики (mouthTrack); длина озвучки (line.duration) ставит тайминги по долям файла, тишина в начале файла остаётся тишиной.
export const CAT_RISE_MS = 260

/** → { ms (длительность реплики), rise (задержка звука, мс), voiced (будет ли звук), timer (таймер старта или 0) } */
export function startCatLine({
  id, line, rate = 1, catApi = null, listenerRef = null, has = hasWordSlot, play = playWordSlot, slotOf = wordSlotInfo, open = openCatVoice,
  setTimer = setTimeout, log = catDebug, hold = gameMicHold, voice = 'slot', waitedMs = 0, why = null,
}) {
  const key = lineKey(id)
  const real = wordBufferMs(key) // настоящая длина озвучки по буферу (мс при скорости 1×); нет буфера — длительность из настроек реплики
  const eff = real ? { ...line, duration: real / 1000 } : line
  const ms = lineMs(eff, rate)
  const api = () => catApi?.current
  if (voice === 'none' && line.text) { // слот не подготовился, голоса системы нет: подпись + рот по тексту, без звука
    log('cat-line-silent', { id, reason: 'no-synth' })
    open({ id, source: 'none', slot: slotOf(key), waitedMs, why, noSynth: true })()
    const rise0 = api()?.isUp?.() === false ? CAT_RISE_MS : 0
    const mouth = () => api()?.speak?.(mouthTrack(line.text, ms, line.words, eff.duration), ms, { id })
    api()?.peek?.(rise0 + ms + 400)
    return { ms, rise: rise0, voiced: false, timer: rise0 ? setTimer(mouth, rise0) : (mouth(), 0) }
  }
  const ready = !!line.url && has(key)
  if (!ready) {
    const reason = line.url ? 'no-slot' : 'no-url'
    log('cat-line-silent', { id, reason })
    open({ id, source: 'none', slot: line.url ? slotOf(key) : null, waitedMs, why: reason === 'no-url' ? 'у реплики нет озвучки (url)' : 'слот не подготовлен' })()
    api()?.peek?.(ms + 400)
    return { ms, rise: 0, voiced: false, timer: 0 }
  }
  const rise = api()?.isUp?.() === false ? CAT_RISE_MS : 0 // голова спрятана — сначала выскочить
  listenerRef?.current?.mute?.(rise + ms + LINE_PAUSE_MS)
  const speak = () => { api()?.speak?.(mouthTrack(line.text, ms, line.words, eff.duration), ms, { id }); hold?.holdFor?.(ms) }
  const silent = reason => { log('cat-line-silent', { id, reason }); api()?.peek?.(ms + 400) }
  const go = () => {
    const slot = slotOf(key)
    const done = open({ id, source: slot.buffer ? 'buffer' : 'slot', slot, waitedMs, why })
    let started = false
    const onStart = () => { started = true; speak() } // рот — по факту старта звука
    const onResult = res => { done(res); if (!started && res?.play !== 'ok' && res?.play !== 'started') silent(res?.play ?? 'no-start') } // звук не стартовал (контекст не запустился): подпись без рта
    if (!play(key, onResult, onStart)) { done({ play: 'rejected', error: 'слот не сыграл' }); silent('no-slot') }
  }
  if (!rise) { go(); return { ms, rise, voiced: true, timer: 0 } }
  api().peek(rise + ms + 400)
  return { ms, rise, voiced: true, timer: setTimer(go, rise) }
}
