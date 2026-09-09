// Запись сессии через rrweb: не видео, а лента изменений DOM — «в 1234мс у
// div.chatBubble transform стал translateY(-40px)». Поэтому она читается как
// лог (Claude разбирает её текстом, без скриншотов) и одновременно
// проигрывается обратно в настоящий DOM с перемоткой на любую миллисекунду.
//
// Готовый файл уходит в _debug/ (debugSink.js). rrweb грузится динамическим
// import() — пакет тяжёлый, и качать его на старте каждому dev-запуску незачем.
import { sendToSink, debugFileName } from './debugSink.js'
import { buildDigest } from './debugDigest.js'

// Длинный урок — это десятки тысяч событий. Лимит не даёт записи незаметно
// вырасти до сотен мегабайт: дошли до потолка — останавливаемся сами и честно
// говорим об этом, а не роняем вкладку по памяти
const MAX_EVENTS = 60_000

let rrweb = null
let stopFn = null
let events = []
let startedAt = 0
let overflowed = false
const listeners = new Set()

export function isRecording() {
  return !!stopFn
}

export function onRecordingChange(fn) {
  listeners.add(fn)
  fn(isRecording())
  return () => listeners.delete(fn)
}

function notify() {
  listeners.forEach(fn => fn(isRecording()))
}

export async function startRecording() {
  if (stopFn) return
  rrweb = rrweb || await import('rrweb')
  events = []
  overflowed = false
  startedAt = Date.now()
  stopFn = rrweb.record({
    emit(event) {
      if (events.length >= MAX_EVENTS) {
        if (!overflowed) { overflowed = true; stopRecording() }
        return
      }
      events.push(event)
    },
    // Каждые 10с — новый полный снапшот страницы: без него запись пришлось бы
    // проигрывать всегда с самого начала, а так плеер может стартовать с
    // ближайшей контрольной точки
    checkoutEveryNms: 10_000,
    // Канвас и шрифты не пишем: канвас складывается в кадры-картинки и разом
    // превращает лёгкую текстовую запись в те самые тяжёлые пиксели, от
    // которых мы и уходили
    recordCanvas: false,
    collectFonts: false,
    // Сам тулбар в запись не пишем: иначе половина ленты — это его же кнопки,
    // всплывающий попап комментария и перерисовка иконок lucide. Смотреть надо
    // на приложение, а не на инструмент, которым смотрят
    blockSelector: '.dbgToolbar, .dbgCommentPopover',
  })
  notify()
}

// Комментарий человека уходит в ту же ленту, что и сам DOM: в плеере видно не
// только «что дёрнулось», но и «вот здесь я сказал, что это неправильно» —
// ровно в тот момент времени, когда это было сказано
export function markInRecording(comment) {
  if (!stopFn || !rrweb) return
  rrweb.record.addCustomEvent('pithy-comment', comment)
}

export async function stopRecording(meta = {}) {
  if (!stopFn) return null
  stopFn()
  stopFn = null
  const info = { ...meta, startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, events: events.length, overflowed }
  notify()
  // Два файла на одну запись: полная — чтобы проигрывать с перемоткой, выжимка
  // — чтобы читать. Имя у них общее, различаются только префиксом
  const stamp = debugFileName('record')
  const file = await sendToSink(stamp, { kind: 'rrweb', meta: info, events })
  const digestFile = await sendToSink(stamp.replace('record-', 'digest-'), buildDigest(events, info))
  return { file, digestFile, events: events.length, overflowed }
}
