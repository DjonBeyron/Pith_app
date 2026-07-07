// Пул переиспользуемых <video> для ленты. Раньше был один общий элемент —
// ради разблокировки автозвука на iOS (она даётся КОНКРЕТНОМУ media-элементу,
// впервые проигранному по жесту). Но один элемент значил, что соседнее видео
// нельзя прогрузить заранее: приезжая на слайд, приходилось ждать загрузку и
// первый кадр — лента ощущалась «туповато».
//
// Пул из нескольких живущих элементов решает это: активный слайд играет на
// своём элементе, а сосед (сверху/снизу) заранее держит свой элемент с уже
// загруженным видео и отрисованным первым кадром — поэтому при свайпе видео
// стартует мгновенно. Разблокировку звука выдаём ВСЕМ элементам пула разом по
// первому жесту (unlockAllForSound): каждый, проигранный в момент жеста,
// получает право играть со звуком и дальше — звук не рвётся при смене слайда.
//
// Элементы живут вне React (создаются один раз, не пересоздаются виртуализацией),
// поэтому разблокировка не теряется. Слайд «арендует» элемент под свой ключ; тот
// же ключ всегда получает тот же элемент (кадры сохраняются). Когда слайдов в
// окне больше, чем элементов, переиспользуется самый давно не нужный (LRU).

const POOL_SIZE = 4
const slots = [] // { el, key, used }
let holder = null
let tick = 0

function makeVideo() {
  const v = document.createElement('video')
  v.className = 'feedMedia poolVideo'
  v.loop = true
  v.preload = 'auto'
  v.muted = true
  v.setAttribute('playsinline', '') // iOS: не открывать нативный плеер
  v.playsInline = true
  v.style.opacity = '1'
  return v
}

function ensure() {
  if (slots.length) return
  for (let i = 0; i < POOL_SIZE; i++) slots.push({ el: makeVideo(), key: null, used: 0 })
}

// Скрытый контейнер вне слайдов: освобождённый элемент переезжает сюда, а не
// уничтожается (иначе потеряли бы разблокировку звука).
function parkEl(el) {
  if (!holder) {
    holder = document.createElement('div')
    holder.style.cssText =
      'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden'
    document.body.appendChild(holder)
  }
  el.pause()
  if (el.parentElement !== holder) holder.appendChild(el)
}

// Взять элемент под слайд key. Тот же key → тот же элемент.
export function leaseVideo(key) {
  ensure()
  let slot = slots.find(s => s.key === key)
  if (!slot) {
    slot = slots.find(s => s.key === null) || slots.reduce((a, b) => (a.used <= b.used ? a : b))
    slot.key = key
  }
  slot.used = ++tick
  return slot.el
}

// Освободить элемент слайда key (ушёл из окна): паркуем. Ключ оставляем — если
// слайд быстро вернётся, получит свой же элемент с уже загруженным видео.
export function releaseVideo(key) {
  const slot = slots.find(s => s.key === key)
  if (slot && slot.el.parentElement && slot.el.parentElement !== holder) parkEl(slot.el)
}

// Разблокировка звука на всех элементах пула — вызывать по жесту пользователя.
// Проигрываем каждый (пока muted): этого достаточно, чтобы дальше элементу было
// разрешено играть со звуком без нового жеста.
export function unlockAllForSound() {
  ensure()
  for (const s of slots) {
    const el = s.el
    // Проигрыш в момент жеста «благословляет» элемент — дальше ему можно играть
    // со звуком без нового жеста. Элементы в слайдах доиграет/погасит их эффект
    // (по active/soundOn); а припаркованные запасные тут же снова на паузу,
    // чтобы не крутились беззвучно вхолостую.
    const parked = holder && el.parentElement === holder
    const p = el.play()
    if (p && p.catch) p.catch(() => {})
    if (parked) { try { el.pause() } catch { /* play прервётся паузой — ок */ } }
  }
}
