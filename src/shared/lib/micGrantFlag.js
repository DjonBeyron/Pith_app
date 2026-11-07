// «Микрофон уже разрешали раньше» (localStorage pithy_mic_granted_at_v1 — когда последний раз getUserMedia дал поток). На iOS navigator.permissions.query({ name: 'microphone' }) не работает,
// поэтому попап гонки решает, показывать ли подсказку «iPhone спросит разрешение…», по этой отметке и по тому, жив ли поток этого сеанса (pitrace/raceMicHelp.js). Ставит её gameMic.js при каждом успехе.
export const MIC_GRANTED_KEY = 'pithy_mic_granted_at_v1'

/** Отметить успех getUserMedia (now — мс, Date.now). Нет хранилища — молча ничего */
export function markMicGranted(now = Date.now(), store = globalThis.localStorage) {
  try { store?.setItem(MIC_GRANTED_KEY, String(Math.round(now))) } catch { /* приватный режим */ }
}

/** Когда последний раз разрешали (мс) или null — не разрешали, нет хранилища, мусор */
export function readMicGrantedAt(store = globalThis.localStorage) {
  try { const v = Number(store?.getItem(MIC_GRANTED_KEY)); return Number.isFinite(v) && v > 0 ? v : null } catch { return null }
}
