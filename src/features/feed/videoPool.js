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

import { fdbg } from '../../shared/lib/feedDebug.js'

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
  v.controls = false
  v.setAttribute('playsinline', '') // iOS: не открывать нативный плеер
  v.playsInline = true
  // Жёстко глушим весь нативный HUD браузера (Android/WebView иногда рисует
  // свой оверлей — play-кнопку/спиннер/иконку каста — поверх видео на пару
  // кадров при старте/буферизации, даже без атрибута controls). CSS в
  // base.css добивает то же самое через ::-webkit-media-controls-*
  v.setAttribute('disablepictureinpicture', '')
  v.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback nofullscreen')
  v.disablePictureInPicture = true
  v.disableRemotePlayback = true
  v.style.opacity = '1'
  // Дебаг жизни элемента в DBG-лог: по этим событиям видно, возобновился ли
  // реальный показ после переноса между вкладками (ev:playing без последующих
  // кадров = стоп-кадр при живом звуке, его ловит watchdog в SlideVideo)
  for (const ev of ['playing', 'seeked', 'waiting', 'stalled', 'error']) {
    v.addEventListener(ev, () =>
      fdbg(`vid ${(v.dataset.url || '—').slice(-8)} ev:${ev} ct=${v.currentTime.toFixed(2)}`))
  }
  // Парковка необратима: play(), вызванный до готовности данных, «висит» и
  // воскрешает видео уже после парковки — элемент играл в холдере (звук без
  // картинки / постер вместо видео на слайде). Любой play у припаркованного
  // гасим немедленно.
  v.addEventListener('play', () => {
    if (v.dataset.parked === '1') {
      fdbg(`vid ${(v.dataset.url || '—').slice(-8)} zombie-play в парковке → пауза`)
      v.pause()
    }
  })
  return v
}

// Виджет Now Playing на экране блокировки/в Пункте управления iOS появляется
// сам по себе, как только видео играет со звуком (WebKit переводит аудио-сессию
// в категорию playback) — публичного способа убрать сам виджет у веб-страниц
// нет. Но раз mediaSession в приложении никогда не настраивался, кнопки на
// виджете достаются автозаглушке iOS с прямым доступом к нашему <video> —
// пустые обработчики обезвреживают именно это: виджет остаётся видимым, но
// плей/пауза/перемотка с него больше не трогают video в приложении.
function disableMediaSessionControls() {
  if (!('mediaSession' in navigator)) return
  const noop = () => {}
  for (const action of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) {
    try { navigator.mediaSession.setActionHandler(action, noop) } catch { /* action не поддержан этим браузером — не критично */ }
  }
}

function ensure() {
  if (slots.length) return
  for (let i = 0; i < POOL_SIZE; i++) slots.push({ el: makeVideo(), key: null, used: 0 })
  disableMediaSessionControls()

  // Сворачивание приложения: iOS ещё ~секунду тянет звук видео после ухода в
  // фон (пока сам не заморозит WebView) — глушим мгновенно по visibilitychange,
  // а по возврату возобновляем те, что играли и не запаркованы. Ручную паузу
  // и чужие элементы не трогаем.
  let hiddenPaused = []
  const onHide = () => {
    // Засекаем время: жалоба на подтормаживание всего телефона при
    // сворачивании — если пауза 4 видео сама по себе долгая (не должна
    // быть), это будет видно здесь, а не только в общем стороже stallWatch
    const t0 = performance.now()
    hiddenPaused = slots.map(s => s.el).filter(el => !el.paused)
    if (!hiddenPaused.length) return
    for (const el of hiddenPaused) el.pause()
    fdbg(`pool: фон → пауза ${hiddenPaused.length} видео (${(performance.now() - t0).toFixed(1)}мс)`)

    // Эксперимент: живой DBG-лог показал лаг всего телефона именно в момент
    // сворачивания и ТОЛЬКО когда звук активен — и он совпадал по времени с
    // visibilitychange, а не с нашей же паузой (пауза в тот раз вообще не
    // сработала — нечего было ставить). Похоже, дело в аудио-сессии iOS
    // (категория playback), которую держит активным именно озвученный элемент
    // (см. переписку про Now Playing/Dynamic Island). Выгружаем src ТОЛЬКО у
    // него (muted=false среди только что поставленных на паузу) — соседей
    // (тёплые muted-элементы для мгновенного старта при свайпе) не трогаем
    const audible = hiddenPaused.find(el => !el.muted)
    if (audible) {
      audible.dataset.unloaded = '1'
      audible.dataset.resumeCt = String(audible.currentTime)
      audible.removeAttribute('src')
      audible.load()
      fdbg(`vid ${(audible.dataset.url || '—').slice(-8)} фон: src выгружен (был озвучен)`)
    }
  }
  const onShow = () => {
    for (const el of hiddenPaused) {
      if (el.dataset.parked === '1' || !el.parentElement || el.parentElement === holder) continue
      if (el.dataset.unloaded === '1') {
        el.dataset.unloaded = ''
        const t0 = performance.now()
        const resumeCt = parseFloat(el.dataset.resumeCt || '0')
        const onLoaded = () => {
          el.removeEventListener('loadedmetadata', onLoaded)
          clearTimeout(safety)
          try { el.currentTime = resumeCt } catch { /* не критично */ }
          fdbg(`vid ${(el.dataset.url || '—').slice(-8)} возврат из фона: src перезагружен (${(performance.now() - t0).toFixed(0)}мс)`)
          const p = el.play()
          if (p && p.catch) p.catch(() => fdbg(`vid ${(el.dataset.url || '—').slice(-8)} возврат из фона: play заблокирован`))
        }
        el.addEventListener('loadedmetadata', onLoaded)
        // Страховка: если метаданные почему-то не пришли (сеть/кэш) — не
        // виснем молча, пробуем play() как есть через 3с
        const safety = setTimeout(onLoaded, 3000)
        el.src = el.dataset.url
        continue
      }
      const p = el.play()
      if (p && p.catch) p.catch(() => fdbg(`vid ${(el.dataset.url || '—').slice(-8)} возврат из фона: play заблокирован`))
    }
    hiddenPaused = []
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onHide()
    else onShow()
  })
  window.addEventListener('pagehide', onHide)
}

// Правило возвращения на слайд: досмотреть осталось < 2с — начинаем сначала.
// Выполняется заранее, в момент ухода (на холодном элементе), чтобы возврат
// был без скачка «старый кадр → начало».
export function prepareReturn(el) {
  const left = el.duration - el.currentTime
  if (Number.isFinite(left) && left < 2 && el.currentTime > 0) {
    fdbg(`vid ${(el.dataset.url || '').slice(-8)} уход: осталось ${left.toFixed(2)}с < 2 → на начало`)
    try { el.currentTime = 0 } catch { /* не критично */ }
  }
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
  // Редкая гонка с экспериментом выгрузки src в фоне (onHide/onShow выше):
  // если слайд покинули раньше, чем onShow успел перезагрузить src, элемент
  // паркуется «пустым» под старым dataset.url — следующая аренда решит, что
  // src уже тот, и не тронет его (см. SlideVideo). Восстанавливаем сразу
  if (el.dataset.unloaded === '1') {
    el.dataset.unloaded = ''
    if (el.dataset.url) el.src = el.dataset.url
  }
  // parked=1 держит элемент на паузе НЕОБРАТИМО (см. zombie-guard в makeVideo)
  // до следующего leaseVideo — благодаря этому переносимый элемент всегда
  // холодный, и переносы не оставляют iOS-стоп-кадров
  el.dataset.parked = '1'
  if (el.parentElement !== holder) holder.appendChild(el)
  // Подготовительный seek — чуть позже: не во время свайпа (дёргает скролл)
  setTimeout(() => { if (el.dataset.parked === '1') prepareReturn(el) }, 300)
}

// Взять элемент под слайд key. Тот же key → тот же элемент.
export function leaseVideo(key) {
  ensure()
  let slot = slots.find(s => s.key === key)
  if (!slot) {
    slot = slots.find(s => s.key === null) || slots.reduce((a, b) => (a.used <= b.used ? a : b))
    // Переиспользование слота (пул кончился) — редкое событие, полезно в логе:
    // частый recycle при переключении вкладок = источник багов возврата
    fdbg(`pool: recycle ${slot.key == null ? '(free)' : 'key#' + slot.key} → key#${key}`)
    slot.key = key
  }
  slot.used = ++tick
  slot.el.dataset.parked = '' // арендованный элемент снова можно играть
  return slot.el
}

// Освободить элемент слайда key (ушёл из окна): паркуем. Ключ оставляем — если
// слайд быстро вернётся, получит свой же элемент с уже загруженным видео.
export function releaseVideo(key) {
  const slot = slots.find(s => s.key === key)
  if (slot && slot.el.parentElement && slot.el.parentElement !== holder) {
    fdbg(`pool: park key#${key} (${(slot.el.dataset.url || '').slice(-8)}) paused=${slot.el.paused}`)
    parkEl(slot.el)
  }
}

// «Сильный пинок» поверхности: pause → seek в ту же позицию → play. Обычного
// pause→play на iOS не хватает: после переноса <video> в DOM декодер работает
// (rvfc идёт, currentTime растёт), а компоузер продолжает показывать старый
// кадр. Принудительный seek заставляет вывести текущий кадр заново.
export function kickSurface(v) {
  v.pause()
  let resumed = false
  const resume = () => {
    if (resumed) return
    resumed = true
    v.removeEventListener('seeked', resume)
    // Пока шёл seek, элемент могли запарковать (быстрый уход с вкладки) —
    // припаркованного не будим, иначе звук «из-за кулис»
    if (v.parentElement !== holder) v.play().catch(() => {})
  }
  v.addEventListener('seeked', resume, { once: true })
  try { v.currentTime = Math.max(0, v.currentTime - 0.01) } catch { resume() }
  setTimeout(resume, 250) // страховка, если seeked не придёт
}

// Тяжёлая артиллерия (если и seek не помог): пересборка поверхности — вынуть
// элемент из DOM на паузе, форсировать reflow, вставить обратно и пнуть.
// Перенос НЕ играющего видео стоп-кадр не вызывает, поэтому это безопасно.
export function rebuildSurface(v) {
  const parent = v.parentElement
  if (!parent) return
  v.pause()
  const next = v.nextSibling
  parent.removeChild(v)
  void document.body.offsetHeight
  parent.insertBefore(v, next)
  kickSurface(v)
}

// Разблокировка звука на всех элементах пула — вызывать по жесту пользователя.
// Проигрываем каждый (пока muted): этого достаточно, чтобы дальше элементу было
// разрешено играть со звуком без нового жеста.
export function unlockAllForSound() {
  ensure()
  fdbg('pool: unlock all (sound gesture)')
  for (const s of slots) {
    const el = s.el
    // Проигрыш в момент жеста «благословляет» элемент — дальше ему можно играть
    // со звуком без нового жеста. Элементы в слайдах доиграет/погасит их эффект
    // (по active/soundOn); а припаркованные запасные тут же снова на паузу,
    // чтобы не крутились беззвучно вхолостую.
    const parked = (holder && el.parentElement === holder) || el.dataset.parked === '1'
    const p = el.play()
    if (p && p.catch) p.catch(() => {})
    if (parked) { try { el.pause() } catch { /* play прервётся паузой — ок */ } }
  }
}
