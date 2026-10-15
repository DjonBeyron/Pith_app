import { MAX_ATTEMPTS } from './sceneTaskState.js'
import { NOTE_WRONG, NOTE_QUIET } from './sceneVoiceState.js'

// Тексты панели голосового задания (чистые функции — тесты без React). Тексты самого микрофона (надпись над кругом, попап
// разрешения) — общие с «Сказать фразу» (shared/lib/speech/sayTexts.js).
export const VOICE_CANT = 'Не могу говорить'
export const VOICE_LATER = 'Спроси позже'
export const VOICE_REPLAY = 'Ещё раз'
export const VOICE_LISTEN_REPLAY = 'Послушать ещё раз'
export const VOICE_OK = '✓ Отлично!'
export const VOICE_BAD = '✗ Не совсем'
export const VOICE_DEAF = '✗ Не расслышал'
export const VOICE_DENIED = 'Нет доступа к микрофону. Разреши его в настройках браузера или нажми «Не могу говорить»'
export const VOICE_OFF = 'Проверка голоса сейчас недоступна. Нажми «Не могу говорить»'

const triesLeft = attempt => {
  const n = MAX_ATTEMPTS - attempt
  return n === 1 ? 'Осталась ещё одна попытка' : `Осталось ещё ${n} попытки`
}

/** Строка-заметка под вопросом (постоянной высоты): причина последней неудачи, подсказка автора, сколько попыток осталось; ''-нечего сказать */
export function voiceNote({ phase, wrong = false, note = null, attempt = 0, hint = '', fallbackReason = null }) {
  if (fallbackReason === 'denied') return VOICE_DENIED
  if (fallbackReason) return VOICE_OFF
  if (!wrong || phase === 'checked') return ''
  if (note === NOTE_WRONG) return `Не совсем.${hint ? ` Подсказка: ${hint}.` : ''} ${triesLeft(attempt)}`
  if (note === NOTE_QUIET) return 'Не расслышал. Скажи чуть громче и ближе к микрофону'
  return 'Не получилось записать. Попробуй ещё раз'
}

/** Вердикт: { title, ok, mine (что услышали, '' — ничего), expected (ожидаемые фразы после неудачи, до 3) } */
export function voiceVerdictView({ ok, heard = '', expected = [] }) {
  const mine = String(heard ?? '').trim()
  if (ok) return { title: VOICE_OK, ok: true, mine, expected: [] }
  return { title: mine ? VOICE_BAD : VOICE_DEAF, ok: false, mine, expected: expected.slice(0, 3) }
}
