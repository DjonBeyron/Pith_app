import { playWordSlot, hasWordSlot } from './wordLaneClips.js'
import { lineKey, lineMs, LINE_PAUSE_MS } from './wordLaneCatLines.js'
import { mouthTrack } from './wordLaneVisemes.js'
import { catDebug } from './wordLaneCatDebug.js'

// Запуск реплики кота (useCatLines.js решает КОГДА — кулдаун, «не накладываются»; здесь — КАК): звук из слота, рот по дорожке, микрофон «не слушает», журнал отладки. Чистая функция — все зависимости приходят
// аргументами, проверяется тестами.
//  • Нет озвучки / звук не подготовлен — рот не двигается (звука нет), реплика остаётся подписью; в журнал уходит cat-line-silent с причиной.
//  • Голова спрятана — сначала выскакивает (пружина идёт 0,55 с), звук и рот стартуют через CAT_RISE_MS, иначе первые слова кот говорит «из-под экрана».
//  • Дорожка рта — по таймингам слов озвучки, нет их — по тексту на всю длительность реплики (mouthTrack); длина озвучки (line.duration) ставит тайминги по долям файла, тишина в начале файла остаётся тишиной.
export const CAT_RISE_MS = 260

/** → { ms (длительность реплики), rise (задержка звука, мс), voiced (будет ли звук), timer (таймер старта или 0) } */
export function startCatLine({
  id, line, rate = 1, catApi = null, listenerRef = null, has = hasWordSlot, play = playWordSlot, setTimer = setTimeout, log = catDebug,
}) {
  const ms = lineMs(line, rate)
  const api = () => catApi?.current
  const ready = !!line.url && has(lineKey(id))
  if (!ready) {
    log('cat-line-silent', { id, reason: line.url ? 'no-slot' : 'no-url' })
    api()?.peek?.(ms + 400)
    return { ms, rise: 0, voiced: false, timer: 0 }
  }
  const rise = api()?.isUp?.() === false ? CAT_RISE_MS : 0 // голова спрятана — сначала выскочить
  listenerRef?.current?.mute?.(rise + ms + LINE_PAUSE_MS)
  const go = () => {
    if (play(lineKey(id))) api()?.speak?.(mouthTrack(line.text, ms, line.words, line.duration), ms, { id })
    else { log('cat-line-silent', { id, reason: 'no-slot' }); api()?.peek?.(ms + 400) }
  }
  if (!rise) { go(); return { ms, rise, voiced: true, timer: 0 } }
  api().peek(rise + ms + 400)
  return { ms, rise, voiced: true, timer: setTimer(go, rise) }
}
