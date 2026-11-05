// Плашка-вопрос перед стартом гонки в стенде («Админ → Голос → Гонка с Питом», CONCEPT_RACE.md): Пит спрашивает, сможет ли человек говорить вслух (реплика race_ask_voice), две кнопки — «Говорю» и «Тапаю».
// Здесь чистая часть без React: запомненный выбор (localStorage pithy_race_voice_choice_v1; нет хранилища или мусор — «Говорю») и текст вопроса из каталога реплик. Плашка спрашивает КАЖДЫЙ запуск (так просил владелец);
// выбор лишь подсвечивает кнопку по умолчанию. «Тапаю» включает режим тапа (pithy_wl_tap_v1) на эту игру, «Говорю» его выключает; после игры прежнее значение возвращается (useRaceAsk.js).
import { RACE_LINES } from './raceLines.js'

export const VOICE_CHOICE_KEY = 'pithy_race_voice_choice_v1'
export const ASK_LINE = 'race_ask_voice'
export const CHOICES = ['voice', 'tap']
export const CHOICE_LABELS = { voice: 'Говорю', tap: 'Тапаю' }

/** Текст вопроса на плашке — реплика race_ask_voice из каталога (одна на плашку и на озвучку) */
export const askText = () => RACE_LINES.find(l => l.id === ASK_LINE)?.text ?? ''

/** Прошлый выбор: 'voice' | 'tap'; нет хранилища, пусто или мусор — 'voice' */
export function readVoiceChoice(store = globalThis.localStorage) {
  try { const v = store?.getItem(VOICE_CHOICE_KEY); return CHOICES.includes(v) ? v : 'voice' } catch { return 'voice' }
}

/** Запомнить выбор; не 'voice' / 'tap' или хранилище не приняло — молча ничего */
export function writeVoiceChoice(choice, store = globalThis.localStorage) {
  if (!CHOICES.includes(choice)) return
  try { store?.setItem(VOICE_CHOICE_KEY, choice) } catch { /* не записалось: останется «Говорю» по умолчанию */ }
}

/** Включён ли режим тапа для выбора: «Тапаю» — да, «Говорю» — нет */
export const tapFor = choice => choice === 'tap'

/**
 * Охранник режима тапа на время игры: «Тапаю» / «Говорю» меняют pithy_wl_tap_v1 на эту игру, потом прежнее значение возвращается.
 *  begin(current) — перед стартом: запомнить прежнее значение (один раз за игру: если прошлая игра не успела вернуть, второй запуск не запомнит уже изменённое);
 *  watch(status) — статус модуля игры (onStatus): → значение, которое пора вернуть, или null. Возврат — когда игра была в phase 'game' и закончилась, либо запуск не удался (status.problem).
 */
export function createTapGuard() {
  let prev = null
  let seen = false
  return {
    begin(current) { if (prev == null) prev = !!current; seen = false },
    watch(status) {
      if (prev == null) return null
      if (status?.phase === 'game') { seen = true; return null }
      if (!seen && !status?.problem) return null
      const back = prev
      prev = null; seen = false
      return back
    },
    pending: () => prev != null,
  }
}
