import FakeTimers from '@sinonjs/fake-timers'

// Единые виртуальные часы всего приложения — фундамент покадровой отладки.
//
// Зачем: debugMedia.js умеет останавливать только то, что видит браузерный
// движок (CSS-анимации через WAAPI + <video>/<audio>). Но добрая половина
// движения в приложении живёт в JS: requestAnimationFrame (XpFlight,
// ChainLines, PhraseBubbleAnimated, flyPanelToChat и ещё десятка полтора
// файлов), setTimeout сценария урока (useGraphPlayer.js) и performance.now()
// беззвучных часов таблицы (silentClock.js). Ловить их по одному нельзя —
// каждый новый вид движения требовал бы нового костыля (так и появились
// registerDebugClock и stepTime).
//
// Решение: не ловить участников, а забрать себе время. Подменяем таймеры
// глобально и сами крутим их «мотором» на настоящем rAF — приложение при этом
// работает как обычно. Пауза = мотор перестаёт тикать, и замирает ВСЁ разом,
// включая то, что появится уже во время паузы: новый элемент рождается в
// правильной фазе, потому что живёт по тем же часам.
//
// Только dev: файл тянется исключительно из mountDebugTools.jsx, который
// App.jsx грузит динамическим import() под import.meta.env.DEV — в прод-бандл
// не попадает ни он, ни сам пакет. Класть это в debugMedia.js было нельзя:
// тот импортируется из прод-кода (TableDictatorPanel.jsx).

// Настоящие таймеры нужно забрать ДО install() — после подмены они ведут в
// фейковые часы, и мотор крутил бы сам себя, никогда не двигаясь.
// Два источника кадров, а не один: rAF даёт плавность, пока вкладку видно, но
// в фоне браузер не шлёт его вовсе — на одном rAF приложение вставало бы колом
// при переключении на соседнюю вкладку (ровно те грабли, о которых
// предупреждает комментарий в silentClock.js). setInterval в фоне живёт, хоть
// и придушенный до ~1 кадра в секунду: время пойдёт медленнее реального, но
// пойдёт.
const hasWindow = typeof window !== 'undefined'
const realRaf = hasWindow ? window.requestAnimationFrame.bind(window) : null
const realSetInterval = hasWindow ? window.setInterval.bind(window) : null
const BACKUP_TICK_MS = 100

// queueMicrotask и Date НЕ подменяем намеренно:
// - микрозадачи держат промисы (Supabase, React) — заморозив их, мы повесили
//   бы и сам тулбар, которым эту паузу снимают;
// - Date трогает авторизацию и метки времени в запросах, а движению он почти
//   не нужен — анимации считают время по performance.now()/rAF.
const TO_FAKE = [
  'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'performance',
]

// Вкладка была в фоне (или разработчик стоял на точке останова) — реальная
// дельта может оказаться в секунды. Прогонять их одним tick нельзя: сценарий
// отыграет десяток шагов разом. Ограничиваем тремя кадрами.
const MAX_DELTA_MS = 100

let clock = null
let running = false
// Сколько раз мотор вообще дошёл до advance() — отличает «часы стоят, потому
// что running=false» от «мотору не приходят кадры»
let frames = 0
// Точка отсчёта мотора в НАСТОЯЩЕМ времени. 0 = «не знаю, с чего считать»:
// следующий кадр просто запомнит момент и время двигать не станет.
// Настоящее время здесь — Date.now(), и это единственная причина, по которой
// Date оставлен неподменённым: performance.now() после install врёт (это уже
// фейковые часы), а мотору нужна честная опора, иначе он мерил бы сам себя.
let lastReal = 0

export function isClockInstalled() {
  return !!clock
}

// Идут ли часы прямо сейчас. Это и есть источник правды о паузе: React-стейт
// тулбара может отстать от них (рендер асинхронный, а на скрытой вкладке ещё
// и откладывается), и тогда кнопка, решая по стейту, делает противоположное —
// «продолжить» ставит на паузу. Спрашиваем часы, а не себя.
export function isClockRunning() {
  return running
}

// Подписка на «часы пошли/встали» — чтобы кнопка тулбара показывала их
// настоящее состояние, а не свою копию в React-стейте. Копия неизбежно
// отставала: сценарий умеет останавливать время сам, минуя кнопку.
const clockListeners = new Set()

export function subscribeClock(fn) {
  clockListeners.add(fn)
  return () => clockListeners.delete(fn)
}

function notifyClock() {
  clockListeners.forEach(fn => fn())
}

// Мотор: на каждом настоящем кадре списываем в виртуальные часы столько же
// миллисекунд, сколько прошло в реальности. Крутится всегда, даже на паузе —
// просто перестаёт двигать время (снимать rAF и заводить заново на каждом
// нажатии не за чем, кадр стоит дешевле, чем эта возня).
// Сколько настоящего времени прошло — столько же списываем в виртуальные часы.
// Зовётся из обоих источников кадров; кто позвал первым, тот и подвинул —
// второй увидит нулевую дельту и просто ничего не сделает.
function advance() {
  frames++
  if (!running || !clock) return
  const now = Date.now()
  if (!lastReal) { lastReal = now; return }
  const delta = Math.min(MAX_DELTA_MS, now - lastReal)
  lastReal = now
  if (delta > 0) clock.tick(delta)
}

function motor() {
  realRaf(motor)
  advance()
}

export function installDebugClock() {
  if (clock || !realRaf) return
  clock = FakeTimers.install({ toFake: TO_FAKE, shouldClearNativeTimers: true })
  running = true
  lastReal = 0
  realRaf(motor)
  realSetInterval(advance, BACKUP_TICK_MS)
  exposeClockState()
}

export function pauseClock() {
  running = false
  notifyClock()
}

export function resumeClock() {
  if (!clock) return
  // Сброс точки отсчёта обязателен: пока стояли, настоящее время ушло вперёд,
  // и первый же кадр после «продолжить» списал бы всю длину паузы разом
  lastReal = 0
  running = true
  notifyClock()
}

// Состояние самих часов — отладка отладчика: когда «продолжить» нажато, а
// время стоит, надо видеть, кто виноват (мотор не крутится или running=false).
// Живёт в window, чтобы смотреть из консоли без импортов.
export function exposeClockState() {
  if (!hasWindow) return
  window.__pithyClock = {
    get running() { return running },
    get virtualNow() { return clock ? clock.now : null },
    get lastReal() { return lastReal },
    get frames() { return frames },
  }
}

// Шаг ровно на N миллисекунд: то же самое, что сделал бы мотор за это время,
// но по нажатию кнопки. Отрицательный шаг физически невозможен — время не
// отматывается назад (уже сработавшие таймеры не «раззвучить»), поэтому
// назад ходим не здесь, а кнопкой «назад» по сценарию (PlayerStepRow).
export function tickClock(ms) {
  if (!clock || ms <= 0) return
  running = false
  clock.tick(ms)
  notifyClock()
}
