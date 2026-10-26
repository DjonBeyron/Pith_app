import { sayPermission } from './speech/sayPermission.js'
import { queryMicPermission } from './speech/speechSupport.js'
import { pLog } from './debug.js'

// Доступ к микрофону «заранее» — для нод, которым микрофон нужен посреди урока (игра «Повтори за диктором»). Звать из тапа (iOS показывает диалог только по жесту).
// Диалог ОС вызывает getUserMedia; поток тут же закрывается — микрофон в этот момент нужен лишь для разрешения, дальше его открывает сам распознаватель (без диалога).
// Результат: 'granted' | 'denied' | 'unavailable'. Общий флаг «микрофон работал» (sayPermission) ставится, чтобы модуль «Сказать фразу» тоже не спрашивал лишнего.
let last = 'unknown'

/** Что известно без диалога: 'granted' | 'denied' | 'prompt' | 'unavailable' | 'unknown' (Permissions API молчит — iPhone Safari) */
export async function micAccessState() {
  if (last === 'granted') return 'granted'
  try { const r = await queryMicPermission(); return r ?? 'unknown' } catch { return 'unknown' }
}

export async function ensureMicAccess() {
  if (last === 'granted') return 'granted'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unavailable'
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
