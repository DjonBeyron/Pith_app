// Пауза "всего, что движется на странице" без единой правки в модулях:
// Web Animations API (document.getAnimations()) ловит CSS-анимации/transition,
// а <video>/<audio> — сами по себе не анимации в терминах WAAPI, поэтому им
// нужен отдельный обход. Canvas-эффекты (rAF-рисование волны/шариков) сюда не
// входят — у них нет общего API паузы без правки в самом модуле.
//
// Пауза здесь — РЕЖИМ, а не разовое действие: пока включена, любая НОВАЯ
// анимация/переход/видео тоже сразу ловится и замирает (слушаем
// animationstart/transitionrun/play, см. onNewMotion). Раньше это была
// отдельная кнопка-прицел "заморозить следующую анимацию" — но обычная пауза
// физически не успевала поймать CSS-transition (он исчезает из браузера, как
// только доигрывает, за 200-400мс), и человеку приходилось сперва взводить
// прицел, потом жать паузу — два действия вместо одного, путаница. Теперь
// пауза сама держит эту ловушку включённой, пока не отпустят "продолжить".
// «Часы вместо аудио» (silentClock.js): таблица-диктант без озвучки крутит
// таймлайн по такому объекту, а не по <audio>. В DOM его нет, поэтому
// querySelectorAll его не находил — и покадровое листание таблицы без звука
// не работало вовсе (пауза не ловила, шаг времени было некуда применить).
// Интерфейс у часов ровно как у медиа-элемента (paused/play/pause/currentTime),
// так что дальше по коду они идут наравне с <audio>.
const clocks = new Set()

export function registerDebugClock(clock) {
  if (!import.meta.env.DEV) return () => {}
  clocks.add(clock)
  // Часы завелись, когда пауза уже держится (панель диктанта смонтировалась
  // при включённой паузе) — сразу ловим их, как ловим новое видео
  if (active && !clock.paused) { clock.pause(); resumable.media.add(clock) }
  return () => clocks.delete(clock)
}

function collect() {
  return {
    anims: document.getAnimations ? document.getAnimations() : [],
    media: [...document.querySelectorAll('video, audio'), ...clocks],
  }
}

let active = false
// Кому важно знать, держим ли мы сейчас паузу. Модулям, которые рисуют себя
// сами в rAF-цикле по audio.currentTime (таблица-диктант), настоящий
// audio.pause() приходит обычным DOM-событием 'pause' и раньше глушил их цикл
// целиком — после этого шаг времени двигал currentTime, а подхватить его было
// уже некому. Теперь такой модуль может спросить «это дебаг-пауза?» и остаться
// живым: звука нет, но кадр пересчитывается.
export function isDebugPaused() {
  return active
}
// Что именно мы сами поставили на паузу — чтобы "продолжить" включал обратно
// только это. Лента виртуализирует слайды и намеренно держит соседние видео
// на паузе; без этого списка "продолжить" будило бы и их тоже.
// Set, а не массив: одна и та же анимация прилетает сюда по нескольку раз
// (animationstart на потомке + transitionrun на нём же), а пауза висит
// подолгу — за это время «печатает…» и прочие индикаторы успевают
// перемонтироваться десятки раз
let resumable = { anims: new Set(), media: new Set() }
let listenerAttached = false

function emptyResumable() {
  return { anims: new Set(), media: new Set() }
}

function catchRunning() {
  const { anims, media } = collect()
  const runningAnims = anims.filter(a => a.playState === 'running')
  const runningMedia = media.filter(m => !m.paused)
  runningAnims.forEach(a => { a.pause(); resumable.anims.add(a) })
  runningMedia.forEach(m => { m.pause(); resumable.media.add(m) })
}

// Элемент уже размонтирован (React снял «печатает…», сменил слайд) — будить
// его анимацию нечем и незачем: у бесконечных (waitingBounce и компания) она
// после .play() крутилась бы вечно на оторванном от документа узле
function stillOnPage(a) {
  const el = a.effect?.target
  return !el || el.isConnected
}

// Новая анимация/переход стартовала, пока мы держим паузу — ловим именно её
function onNewMotion(e) {
  if (!active) return
  const el = e.target
  if (!(el instanceof Element) || !el.getAnimations) return
  el.getAnimations().filter(a => a.playState === 'running').forEach(a => {
    a.pause()
    resumable.anims.add(a)
  })
}

// <video>/<audio> не шлют animationstart — своё событие 'play'. Оно не
// всплывает, но capture-слушатель на document всё равно видит его на пути
// вниз к цели (bubbles тут ни при чём — это свойство фазы всплытия)
function onMediaPlay(e) {
  if (!active) return
  const m = e.target
  if (!(m instanceof HTMLMediaElement)) return
  m.pause()
  resumable.media.add(m)
}

function ensureListener() {
  if (listenerAttached) return
  listenerAttached = true
  const opts = { capture: true }
  document.addEventListener('animationstart', onNewMotion, opts)
  document.addEventListener('transitionrun', onNewMotion, opts)
  document.addEventListener('play', onMediaPlay, opts)
}

export function pauseAll() {
  if (active) return
  active = true
  ensureListener()
  resumable = emptyResumable()
  // active=true выставлен ДО catchRunning: пауза аудио прилетит модулю
  // событием 'pause', и к этому моменту isDebugPaused() уже должен отвечать
  // «да, пауза наша»
  catchRunning()
}

export function playAll() {
  active = false
  resumable.anims.forEach(a => { if (stillOnPage(a)) a.play() })
  // isConnected есть только у DOM-медиа; у часов его нет вовсе — им проверка
  // «ещё на странице» не нужна (снимаются с учёта при размонтировании панели)
  resumable.media.forEach(m => { if (m.isConnected ?? true) m.play()?.catch?.(() => {}) })
  resumable = emptyResumable()
}

export function stepAll(deltaMs) {
  if (!active) pauseAll()
  const { anims, media } = collect()
  anims.forEach(a => {
    const cur = typeof a.currentTime === 'number' ? a.currentTime : 0
    a.currentTime = Math.max(0, cur + deltaMs)
  })
  media.forEach(m => {
    m.currentTime = Math.max(0, m.currentTime + deltaMs / 1000)
  })
}
