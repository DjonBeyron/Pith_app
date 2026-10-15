import { nextCounts } from '../../../shared/lib/speech/sayFlow.js'
import { isQuietCode } from '../../../shared/lib/speech/speechPolicy.js'
import { MAX_ATTEMPTS } from './sceneTaskState.js'

// Переходы панели ГОЛОСОВОГО задания ('say' «Ответь коту» / 'repeat' «Повтори за диктором») — чистые функции над тем же
// состоянием, что у «О чём диалог» (sceneTaskState.js: open → ready, close → closed, isOpen). Фазы:
//   idle → ready (панель открыта, микрофон готов) ⇄ listening (идёт запись) → checked (вердикт) → closed.
// listen: тап по микрофону; unlisten: запись прервана/отменена, попытка не потрачена; pass / fail: итог попытки.
// Попытки считает тот же счёт, что у «Сказать фразу» (nextCounts): распознано что-то (пусть неверное) — попытка; тишина — нет,
// но три тишины подряд = одна; ошибки движка и микрофона не тратят. MAX_ATTEMPTS (две) — как у клавиатурного задания.
// «Не могу говорить» / «Спроси позже» — просто close (пропуск без штрафа). Штрафов нет никогда.

export const NOTE_WRONG = 'wrong' // распознано, но не то
export const NOTE_QUIET = 'quiet' // тишина («Не расслышал»)
export const NOTE_ERROR = 'error' // микрофон/движок не отработал

export function listen(s) {
  return s.phase === 'ready' ? { ...s, phase: 'listening' } : s
}

export function unlisten(s) {
  return s.phase === 'listening' ? { ...s, phase: 'ready' } : s
}

const live = s => s.phase === 'ready' || s.phase === 'listening'

// Верный ответ → вердикт сразу. heard — транскрипт (показываем в панели, в аналитику не уходит)
export function pass(s, { heard = '', result = null } = {}) {
  if (!live(s)) return s
  return { ...s, phase: 'checked', attempt: s.attempt + 1, silences: 0, ok: true, wrong: false, note: null, heard, result }
}

// Неверный / не расслышанный ответ → ещё попытка (ready) или вердикт (checked) после MAX_ATTEMPTS
export function fail(s, { heard = '', spoke = false, quiet = false, result = null } = {}) {
  if (!live(s)) return s
  const counts = nextCounts({ attempts: s.attempt, silences: s.silences }, { spoke, quiet })
  const note = spoke ? NOTE_WRONG : quiet ? NOTE_QUIET : NOTE_ERROR
  const next = { ...s, attempt: counts.attempts, silences: counts.silences, wrong: true, note, heard: spoke ? heard : s.heard, result: result ?? s.result }
  return counts.attempts >= MAX_ATTEMPTS ? { ...next, phase: 'checked', ok: false } : { ...next, phase: 'ready' }
}

// Итог неудачной попытки по виду sayFlow (hook): spoke — распознано что-то; quiet — тишина. Та же логика, что в settle() у sayFlow
export function failKind({ verdict = null, errorCode = null } = {}) {
  const spoke = !!verdict?.heard?.trim()
  return { spoke, quiet: !spoke && (isQuietCode(errorCode) || (!errorCode && !!verdict)) }
}

// Попытка завершилась «засчитанным» ответом (для события scene_task_answer): верный, распознанный неверный или вердикт после последней попытки
export const countedAnswer = (res, next) => !!res.ok || !!res.spoke || next.phase === 'checked'

// Свойства события scene_task_answer голосового вида: плоские, без транскрипта (только числа и флаги)
export function voiceAnswerProps({ sceneId, kind, next, openedAt, engine, now = Date.now() }) {
  return { scene_id: sceneId, kind, ok: next.ok, attempt: next.attempt, ms: Math.max(0, now - openedAt), engine: engine === 'vosk' ? 'vosk' : 'system' }
}
