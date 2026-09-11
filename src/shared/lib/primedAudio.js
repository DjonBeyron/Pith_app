import { pLog } from './debug.js'

// Один <audio>, которому Safari РАЗРЕШИЛ играть со звуком.
//
// Зачем. Автозапуск разрешается не странице целиком, а конкретному
// media-элементу: тот, что хоть раз стартовал внутри пользовательского жеста,
// дальше может играть и сам. Элемент, созданный позже и запущенный по таймеру,
// снова под запретом.
//
// Из-за этого молчала авто-таблица. Её <audio> рождается вместе с панелью и
// стартует через 800 мс — жеста в этот момент нет. В логе с iPhone это видно
// дословно: таблица получает NotAllowedError и крутит таймлайн часами, без
// звука, хотя спектр рисуется и файл на месте.
//
// Как лечим. На жесте прогреваем этот элемент коротким беззвучным файлом.
// Разрешение остаётся при нём на весь урок, и когда родной <audio> панели
// получает отказ, тот же диктант доигрывает прогретый.
//
// ВАЖНО: прогрев идёт БЕЗ muted. Приглушённый автозапуск Safari разрешает и
// без всякого жеста, поэтому такой play ничего не открывает — элемент как был
// без права на звук, так и остаётся. Слышно при этом ничего не будет: файл
// сам по себе тишина (0.05 с, 8 кГц, 8 бит).
const SILENCE = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'

let el = null
let ready = false
let waitingGesture = false

function ensureEl() {
  if (el) return el
  el = document.createElement('audio')
  // playsinline обязателен: без него iOS уводит звук в полноэкранный плеер
  el.setAttribute('playsinline', '')
  // Тот же замок, что у родного <audio> панели (useSoloMedia): пока идёт
  // разбор, запуск голосового из переписки его не перебивает. Без атрибута
  // запасной путь терял бы эту защиту
  el.setAttribute('data-solo-lock', '')
  el.preload = 'auto'
  el.style.display = 'none'
  document.body.appendChild(el)
  return el
}

// Зовётся из пользовательского жеста. Точек входа две: «Начать урок» и — на
// случай, если там не получилось — первое же касание экрана. Лог плеера в
// момент старта урока ещё чистится (PlayerTopBar.clearPlayerLog), поэтому
// итог прогрева виден не здесь, а в отчёте playPrimed.
export function primeAudio() {
  if (typeof document === 'undefined' || ready) return
  const a = ensureEl()
  a.muted = false
  a.src = SILENCE
  a.play()
    .then(() => {
      a.pause()
      a.currentTime = 0
      ready = true
      pLog('[primed] элемент прогрет — авто-таблица сможет звучать без свежего жеста')
    })
    .catch(e => {
      pLog(`[primed] прогреть не удалось (${e?.name ?? e}) — пробуем на следующем касании`)
      armGesture()
    })
}

// Страховка: прогреться при первом касании экрана. Один раз и только пока не
// получилось — дальше слушатель снимается сам
function armGesture() {
  if (waitingGesture || ready || typeof document === 'undefined') return
  waitingGesture = true
  const retry = () => {
    document.removeEventListener('pointerdown', retry, true)
    document.removeEventListener('touchstart', retry, true)
    waitingGesture = false
    primeAudio()
  }
  document.addEventListener('pointerdown', retry, true)
  document.addEventListener('touchstart', retry, true)
}

export function armPrimeOnGesture() { armGesture() }

// Запасной путь, когда родному <audio> отказали. Возвращает готовый к работе
// элемент (таймлайн дальше читает его currentTime) либо null — тогда прогона
// со звуком не будет и остаются часы.
export function playPrimed(src, { onEnded } = {}) {
  if (!el || !ready || !src) {
    pLog(`[primed] запасной путь недоступен: элемент=${el ? 'есть' : 'нет'} прогрет=${ready} src=${src ? 'есть' : 'нет'}`)
    // Раз уж не прогрелись — попробуем на ближайшем касании, чтобы следующая
    // таблица урока прозвучала
    armGesture()
    return null
  }
  try {
    el.onended = onEnded ?? null
    el.muted = false
    el.src = src
    el.currentTime = 0
    el.play().catch(e => pLog(`[primed] запасной путь тоже отказал: ${e?.name ?? e}`))
    pLog('[primed] звук таблицы идёт через прогретый элемент')
    return el
  } catch (e) {
    pLog(`[primed] запасной путь сломался: ${e?.message ?? e}`)
    return null
  }
}

// Панель ушла — снимаем за собой, иначе следующий разбор получит чужой onended
export function stopPrimed() {
  if (!el) return
  el.onended = null
  try { el.pause() } catch { /* уже остановлен */ }
}
