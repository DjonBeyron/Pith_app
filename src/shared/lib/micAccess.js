import { sayPermission } from './speech/sayPermission.js'
import { queryMicPermission } from './speech/speechSupport.js'
import { pLog } from './debug.js'
import { openGameMic, gameMicConstraints } from './gameMic.js'

// Доступ к микрофону «заранее» — для нод, которым микрофон нужен посреди урока (игра «Повтори за диктором»). Звать из тапа (iOS показывает диалог только по жесту).
// Диалог ОС вызывает getUserMedia; поток тут же закрывается — микрофон в этот момент нужен лишь для разрешения, дальше его открывает сам распознаватель (без диалога).
// Результат: 'granted' | 'denied' | 'unavailable'. Общий флаг «микрофон работал» (sayPermission) ставится, чтобы модуль «Сказать фразу» тоже не спрашивал лишнего.
let last = 'unknown'

/**
 * iPhone/iPad (в том числе приложение на домашнем экране): iOS не запоминает разрешение между открытиями микрофона — каждый новый getUserMedia после остановки потока спрашивает заново
 * (пока поток жив, повторного запроса нет). Поэтому там разрешение «заранее» бесполезно (оно не доживёт до игры), а урок открывает игровой поток сразу (gameMic.js). Игра на ЛЮБОЙ платформе всё равно берёт один поток в тапе «Начать» на своей карточке.
 */
export function micNeedsHold(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false
  const ua = String(nav.userAgent ?? '')
  return /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) // iPadOS притворяется Mac
}

/** Что известно без диалога: 'granted' | 'denied' | 'prompt' | 'unavailable' | 'unknown' (Permissions API молчит — iPhone Safari) */
export async function micAccessState() {
  if (last === 'granted') return 'granted'
  try { const r = await queryMicPermission(); return r ?? 'unknown' } catch { return 'unknown' }
}

export async function ensureMicAccess() {
  if (last === 'granted') return 'granted'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unavailable'
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: gameMicConstraints() }) // без эхо/шумоподавления, как в игре: даже короткий поток с обработкой переводит Android Chrome в «коммуникационный» режим звука
    stream.getTracks().forEach(t => { try { t.stop() } catch { /* уже остановлен */ } })
    last = 'granted'
    sayPermission.markMicOk()
    return 'granted'
  } catch (e) {
    pLog(`[mic] доступ не получен: ${e?.name ?? e}`)
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') { sayPermission.markDenied(); return 'denied' }
    return 'unavailable'
  }
}

/**
 * Подтверждение микрофона ПЕРЕД стартом урока с игрой «Повтори за диктором»: доступ уже есть — сразу; иначе показываем системный запрос (по тапу «Начать» — это жест) и ждём ответа,
 * чтобы диалог не вылез посреди урока. Любой ответ (разрешили, отказали, нет микрофона) пускает урок дальше: без микрофона игра идёт в ручном режиме. Не бросает; страховочный таймаут
 * (диалог не закрыли) — урок всё равно стартует.
 */
export const MIC_CONFIRM_TIMEOUT_MS = 30000
export async function confirmMicBeforeStart({ timeoutMs = MIC_CONFIRM_TIMEOUT_MS } = {}) {
  if (micNeedsHold()) return openGameMic() // iOS: разрешение не запоминается — открываем поток сразу в тапе «Начать урок» (запрос до чата) и держим до конца игры или урока (gameMic.js)
  try {
    if (await micAccessState() === 'granted') return 'granted'
    let timer
    const limit = new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs) })
    const r = await Promise.race([ensureMicAccess(), limit])
    clearTimeout(timer)
    return r
  } catch { return 'unavailable' }
}
