import { pLog } from './debug.js'

// Разрешение на датчик движения (DeviceOrientationEvent).
//
// Нужно ноде «переверни телефон»: ориентация ЭКРАНА (matchMedia) молчит,
// если у человека включён системный замок поворота, — экран остаётся
// портретным, что бы он ни делал с телефоном. А датчик движения сообщает
// наклон самого устройства и на замок не смотрит: телефон лёг набок — мы это
// видим.
//
// iOS 13+ отдаёт датчик только после явного requestPermission(), и звать его
// можно лишь из пользовательского жеста — иначе тихий отказ. Android и
// старые iOS разрешения не спрашивают вовсе.
//
// Спрашиваем на «Начать урок» — в любом уроке, один раз. Согласие помним в
// localStorage: при следующих запусках iOS диалог уже не показывает, но
// вызвать requestPermission всё равно нужно снова — и снова из жеста. Поэтому
// на старте приложения, если согласие было, тихо повторяем запрос на первом
// же касании (armMotionOnGesture): к ноде датчик готов и там, где кнопки
// «Начать урок» не было — превью админа, возврат в урок по стеку.
const REMEMBER_KEY = 'pithy_motion_ok_v1'

let state = 'unknown' // 'unknown' | 'granted' | 'denied' | 'not-needed' | 'unavailable'
let armed = false

function remembered() {
  try { return localStorage.getItem(REMEMBER_KEY) === '1' } catch { return false }
}

export function motionPermissionState() { return state }

// Звать ИЗ ЖЕСТА (клик/тап). Возвращает промис с итоговым состоянием.
export async function requestMotionPermission() {
  if (state === 'granted' || state === 'not-needed') return state
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
    state = 'unavailable'
    return state
  }
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
    // Android, десктоп, iOS до 13: событие приходит без вопросов
    state = 'not-needed'
    return state
  }
  try {
    const r = await DeviceOrientationEvent.requestPermission()
    state = r === 'granted' ? 'granted' : 'denied'
    try { if (state === 'granted') localStorage.setItem(REMEMBER_KEY, '1') } catch { /* приватный режим */ }
  } catch (e) {
    // Вызов не из жеста или пользователь закрыл диалог
    state = 'denied'
    pLog(`[motion] разрешение не получено: ${e?.name ?? e}`)
  }
  pLog(`[motion] датчик движения: ${state}`)
  return state
}

// Согласие уже давали — тихо продлеваем его на первом касании в этой сессии.
// Диалога не будет (iOS помнит), но без вызова из жеста датчик не включится
export function armMotionOnGesture() {
  if (armed || typeof document === 'undefined' || !remembered()) return
  if (state === 'granted' || state === 'not-needed') return
  armed = true
  const once = () => {
    document.removeEventListener('pointerdown', once, true)
    document.removeEventListener('touchstart', once, true)
    requestMotionPermission()
  }
  document.addEventListener('pointerdown', once, true)
  document.addEventListener('touchstart', once, true)
}

// Можно ли подписываться на deviceorientation прямо сейчас. Там, где
// разрешения не существует (Android, десктоп), подписка работает и без
// вызова requestMotionPermission — например, в превью админа из канваса,
// где кнопки «Начать урок» нет
export function motionAllowed() {
  if (state === 'granted' || state === 'not-needed') return true
  if (state !== 'unknown') return false
  return typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission !== 'function'
}
