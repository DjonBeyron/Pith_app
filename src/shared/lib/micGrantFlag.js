// «Микрофон уже разрешали раньше» (localStorage pithy_mic_granted_at_v1 — когда последний раз getUserMedia дал поток). На iOS navigator.permissions.query({ name: 'microphone' }) не работает,
// поэтому попап гонки решает, показывать ли подсказку «iPhone спросит разрешение…», по этой отметке и по тому, жив ли поток этого сеанса (pitrace/raceMicHelp.js). Ставит её gameMic.js при каждом успехе.
export const MIC_GRANTED_KEY = 'pithy_mic_granted_at_v1'

// Счётчик «запусков с диалогом» (pithy_mic_launches_v1): растёт на успехе getUserMedia, если с прошлого успеха больше часа (поток живёт весь сеанс, повторные успехи внутри часа — тот же запуск).
// По нему попап решает, пора ли подсказать про настройку Safari (pitrace/raceMicSettingsTip.js).
export const MIC_LAUNCHES_KEY = 'pithy_mic_launches_v1'
export const MIC_LAUNCH_GAP_MS = 60 * 60 * 1000

/** Сколько запусков с диалогом было (0 — нет хранилища, мусор) */
export function readMicLaunches(store = globalThis.localStorage) {
  try { const v = Number(store?.getItem(MIC_LAUNCHES_KEY)); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 } catch { return 0 }
}

/** Отметить успех getUserMedia (now — мс, Date.now). Нет хранилища — молча ничего */
export function markMicGranted(now = Date.now(), store = globalThis.localStorage) {
  try {
    const prev = readMicGrantedAt(store)
    store?.setItem(MIC_GRANTED_KEY, String(Math.round(now)))
    if (prev == null || now - prev > MIC_LAUNCH_GAP_MS) store?.setItem(MIC_LAUNCHES_KEY, String(readMicLaunches(store) + 1))
  } catch { /* приватный режим */ }
}

/** Когда последний раз разрешали (мс) или null — не разрешали, нет хранилища, мусор */
export function readMicGrantedAt(store = globalThis.localStorage) {
  try { const v = Number(store?.getItem(MIC_GRANTED_KEY)); return Number.isFinite(v) && v > 0 ? v : null } catch { return null }
}
