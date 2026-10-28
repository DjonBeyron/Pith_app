// «Первое прослушивание со звуком» (PLAN_NEW_USER.md → B2, решение 6): значок сложности в ленте скрыт, пока человек не
// послушал хоть одно видео со звуком, — чужая оценка не должна задавать ожидание заранее. Без React: подписка на события
// журнала и таймер подаются снаружи (useFirstListen.js), поэтому правило проверяется обычным тестом.
// Правило: звук включён (feed_sound { on: true }) и видео играло подряд FIRST_LISTEN_MS — пауза (feed_pause on) или
// выключение звука отсчёт сбрасывают, снятие паузы / свайп начинают заново. Засчиталось — флаг на устройстве навсегда.
// Кто включал звук раньше этой версии (pithy_sound_ever_v1) — уже «слушал», значок ему виден сразу.

export const FIRST_LISTEN_KEY = 'pithy_first_listen_v1'
export const EVER_SOUND_KEY = 'pithy_sound_ever_v1' // useFeedSound.js: включал ли звук хоть раз
export const FIRST_LISTEN_MS = 3000

function readFlag(storage) {
  try { return storage?.getItem(FIRST_LISTEN_KEY) === '1' || storage?.getItem(EVER_SOUND_KEY) === '1' } catch { return false }
}

export function createFirstListen({ storage = null, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let done = readFlag(storage)
  let soundOn = false
  let paused = false
  let timer = null
  const listeners = new Set()

  const stop = () => { clearTimer(timer); timer = null }
  function finish() {
    timer = null
    done = true
    try { storage?.setItem(FIRST_LISTEN_KEY, '1') } catch { /* нет localStorage — до перезапуска помним в памяти */ }
    listeners.forEach(fn => fn())
  }
  // Идёт ли «прослушивание» прямо сейчас: звук есть и не на паузе
  function sync() {
    stop()
    if (!done && soundOn && !paused) timer = setTimer(finish, FIRST_LISTEN_MS)
  }

  return {
    get: () => done,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    onEvent(name, props) {
      if (done) return
      if (name === 'feed_sound') {
        soundOn = !!props?.on
        sync()
      } else if (name === 'feed_pause') {
        paused = !!props?.on
        sync()
      } else if (name === 'feed_swipe' && paused) {
        paused = false // новый слайд играет сам
        sync()
      }
    },
    dispose() { stop(); listeners.clear() },
  }
}
