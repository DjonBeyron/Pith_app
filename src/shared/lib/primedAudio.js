import { pLog } from './debug.js'

// Один <audio>, которому Safari РАЗРЕШИЛ играть.
//
// Зачем. Автозапуск звука разрешается не странице целиком, а конкретному
// media-элементу: тот, что хоть раз стартовал внутри пользовательского жеста,
// дальше может играть и сам. Элемент, созданный позже и запущенный по таймеру,
// снова под запретом.
//
// Из-за этого молчала авто-таблица. Её <audio> рождается вместе с панелью и
// стартует через 800 мс — жеста в этот момент нет. В логе с iPhone это видно
// дословно: первая таблица урока получает NotAllowedError и крутит таймлайн
// часами, без звука. Вторая в том же уроке звучит — но лишь потому, что за
// четыре секунды до неё человек нажимал play на голосовом, и у Safari ещё не
// истекла «свежая активация». То есть звучание таблицы зависело от того,
// трогал ли ученик экран незадолго до неё.
//
// Как лечим. На старте урока («Начать урок» — настоящий жест) прогреваем этот
// элемент тишиной. Разрешение остаётся при нём на весь урок, и когда родной
// <audio> панели получает отказ, тот же файл доигрывает прогретый.
//
// Прогрев — беззвучный WAV в 44 байта заголовка: короче некуда, а сети не
// касается вовсе.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA='

let el = null
let ready = false

// Зовётся из пользовательского жеста (LessonLaunchCard: «Начать урок»)
export function primeAudio() {
  if (typeof document === 'undefined') return
  if (!el) {
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
  }
  if (ready) return
  el.muted = true
  el.src = SILENCE
  el.play()
    .then(() => {
      el.pause()
      el.muted = false
      ready = true
      pLog('[primed] элемент прогрет — авто-таблица сможет звучать без свежего жеста')
    })
    .catch(e => pLog(`[primed] прогреть не удалось: ${e?.name ?? e}`))
}

// Запасной путь, когда родному <audio> отказали. Возвращает готовый к работе
// элемент (таймлайн дальше читает его currentTime) либо null — тогда прогона
// со звуком не будет и остаются часы.
export function playPrimed(src, { onEnded } = {}) {
  if (!el || !ready || !src) return null
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
