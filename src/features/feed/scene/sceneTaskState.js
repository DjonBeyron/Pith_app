import { appendChar, removeLast } from '../../../shared/lib/typeWordKeys.js'
import { checkTaskAnswer } from '../../scene/v2/sceneTask.js'

// Состояние панели «О чём диалог» на слайде-сцене — чистые переходы без React (useSceneTask связывает с рендером).
// Фазы: idle (диалог ещё не доиграл) → ready (панель открыта, пусто) → answering (есть набранное)
//       → checked (вердикт: ok, либо вторая неверная, либо «Не знаю») → closed (панель ушла).
// Голосовые виды ('say' / 'repeat') идут по ready ⇄ listening → checked (переходы — sceneVoiceState.js, клавиатуры нет).
// Неверная первая попытка возвращает в answering с wrong=true и подсказкой; попыток MAX_ATTEMPTS.
export const MAX_ATTEMPTS = 2
export const TYPED_MAX = 160

export const initialTask = (key = null) => ({
  sceneKey: key, phase: 'idle', typed: '', attempt: 0, wrong: false, result: null, ok: false, gaveUp: false, openedAt: 0,
  silences: 0, heard: '', note: null, // голосовые виды (sceneVoiceState.js): тишин подряд, последнее услышанное, причина неудачи
})

export function open(s, now = Date.now()) {
  if (s.phase !== 'idle') return s
  return { ...s, phase: 'ready', openedAt: now }
}

const typing = s => s.phase === 'ready' || s.phase === 'answering'

export function press(s, ch) {
  if (!typing(s)) return s
  const typed = appendChar(s.typed, ch, TYPED_MAX, { capitalize: true })
  if (typed === s.typed) return s
  return { ...s, typed, phase: 'answering', wrong: false }
}

export function backspace(s) {
  if (!typing(s) || !s.typed) return s
  const typed = removeLast(s.typed)
  return { ...s, typed, phase: typed ? 'answering' : 'ready' }
}

// «Проверить» → { state, result } (result — вердикт checkTaskAnswer или null, если проверять было нечего)
export function check(s, task, line) {
  if (s.phase !== 'answering' || !s.typed.trim()) return { state: s, result: null }
  const result = checkTaskAnswer(task, line, s.typed)
  const attempt = s.attempt + 1
  if (result.ok || attempt >= MAX_ATTEMPTS) return { state: { ...s, phase: 'checked', attempt, result, ok: result.ok, wrong: !result.ok }, result }
  return { state: { ...s, phase: 'answering', attempt, result, wrong: true }, result }
}

// «Не знаю» — показать верный перевод без попытки
export function giveUp(s, task, line) {
  if (!typing(s)) return s
  const result = checkTaskAnswer(task, line, '')
  return { ...s, phase: 'checked', result, ok: false, wrong: false, gaveUp: true }
}

// «Спроси позже» / «Готово» — панель уходит
export function close(s) {
  if (s.phase === 'idle' || s.phase === 'closed') return s
  return { ...s, phase: 'closed' }
}

export const isOpen = s => s.phase === 'ready' || s.phase === 'answering' || s.phase === 'listening' || s.phase === 'checked'
export const canCheck = s => s.phase === 'answering' && s.typed.trim().length > 0
export const attemptsLeft = s => Math.max(0, MAX_ATTEMPTS - s.attempt)
