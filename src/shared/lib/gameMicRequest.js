// «Микрофон запрашивается» (v3.3.147): пока наш getUserMedia ждёт ответа и ещё MIC_GRACE_MS после ответа, iOS показывает и убирает системный диалог доступа — окно теряет и возвращает фокус.
// Журнал владельца (iPhone, iOS 18.7): «Продолжить» → getUserMedia → blur от диалога → пауза закрыла сессию и микрофон посреди нашего же запроса → «поток открылся уже после закрытия игры».
// Поэтому blur/focus в это окно — не уход (wordLanePauseEvents.js, gameAudioLife.js); hidden / pagehide / freeze считаются как раньше. Отметки ставит openGameMic (gameMic.js). Чистое состояние модуля.
import { pLog } from './debug.js'

export const MIC_GRACE_MS = 1500 // столько после ответа getUserMedia blur/focus ещё не считаются (диалог уезжает, фокус возвращается)

let pending = 0       // сколько запросов getUserMedia ждут ответа
let askedAt = null    // когда начался последний запрос, мс
let answeredAt = null // когда пришёл последний ответ, мс
const clock = () => performance.now()

/** openGameMic: getUserMedia вызван */
export function micRequestBegin(now = clock(), log = pLog) {
  pending += 1; askedAt = now
  log('[audio] микрофон: запрос getUserMedia (blur/focus за это время не пауза)')
}

/** openGameMic: getUserMedia ответил (result — 'granted' | 'denied' | 'unavailable') */
export function micRequestEnd(result, now = clock(), log = pLog) {
  pending = Math.max(0, pending - 1); answeredAt = now
  log(`[audio] микрофон: ответ ${result} через ${askedAt == null ? '—' : Math.round(now - askedAt)} мс (blur/focus ещё ${String(MIC_GRACE_MS / 1000).replace('.', ',')} с не пауза)`)
}

/** Идёт наш запрос микрофона (или ответ пришёл меньше MIC_GRACE_MS назад) — blur/focus сейчас от системного диалога, а не уход */
export const micRequestPending = (now = clock()) => pending > 0 || (answeredAt != null && now - answeredAt < MIC_GRACE_MS)

/** Метки для журнала и тестов */
export const micRequestStamp = () => ({ pending, askedAt, answeredAt })

/** Тесты: сбросить состояние */
export function resetMicRequest() { pending = 0; askedAt = null; answeredAt = null }
