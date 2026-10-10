import { pLog } from './debug.js'
import { isMicBusy, onMicFree } from './soundQuiet.js'
import { isLessonOpen } from './lessonOpen.js'
import { unlockAudio, soundCtxState } from './sounds.js'
import { createAudioSession } from './speech/speechAudioSession.js'

// Возврат звука приложению после микрофона. Когда закрылось последнее удержание тишины (запись «Сказать фразу» + хвост, вкладка «Голос»), страница могла остаться:
//  - в аудиосессии 'play-and-record' (ставится на время записи, потом должна вернуться в 'auto'; если сброс не дошёл — звук идёт в ресивер/тихо);
//  - с общим контекстом звуков в 'suspended'/'interrupted' (iOS после записи).
// Здесь: тип сессии → 'auto' (если не он), а в уроке — unlockAudio() (resume контекста; в sounds.js он сам отказывается, пока микрофон занят). Всё в try/catch, без API — просто лог.
// Зовёт installAudioRestore() (App.jsx) по сигналу soundQuiet.onMicFree; deps подставляются в тестах.
export function restoreAudio({ session = createAudioSession(), unlock = unlockAudio, lessonOpen = isLessonOpen, busy = isMicBusy, ctxState = soundCtxState, log = pLog } = {}) {
  if (busy()) return { skipped: true }
  const before = session.current()
  let reset = false
  if (before && before !== 'auto') reset = session.set('auto')
  const ctx = ctxState()
  let resumed = false
  if (lessonOpen() && ctx && ctx !== 'running') { try { unlock(); resumed = true } catch { /* звук необязателен */ } }
  log(`[sound] после микрофона: аудиосессия ${before ?? '—'}${reset ? '→auto' : ''}, контекст звуков ${ctx ?? 'нет'}${resumed ? ' → resume' : ''}`)
  return { skipped: false, before, reset, ctx, resumed }
}

export function installAudioRestore(deps = {}) {
  return onMicFree(() => { try { restoreAudio(deps) } catch { /* восстановление не должно ломать звук */ } })
}
