// Плашка-вопрос перед стартом гонки в стенде («Админ → Голос → Гонка с Питом», CONCEPT_RACE.md): Пит спрашивает, сможет ли человек говорить вслух (реплика race_ask_voice), две кнопки — «Голосом» (choice 'voice', раньше «Говорю») и «Пальцами» ('tap', раньше «Тапаю»).
// Здесь чистая часть без React: запомненный выбор (localStorage pithy_race_voice_choice_v1; нет хранилища или мусор — «Говорю») и текст вопроса из каталога реплик. Плашка спрашивает КАЖДЫЙ запуск (так просил владелец);
// выбор лишь подсвечивает кнопку по умолчанию. «Тапаю» включает режим тапа (pithy_wl_tap_v1) на эту игру, «Говорю» его выключает; после игры прежнее значение возвращается (useRaceAsk.js).
import { RACE_LINES } from './raceLines.js'

export const VOICE_CHOICE_KEY = 'pithy_race_voice_choice_v1'
export const ASK_LINE = 'race_ask_voice'
export const CHOICES = ['voice', 'tap']
export const CHOICE_LABELS = { voice: 'Голосом', tap: 'Пальцами' }
// «Говорю»: пока ждём ответ системы о микрофоне и пока звук улягается после смены аудиосессии, попап остаётся, кнопка показывает, чего ждём (второго нажатия нет)
export const WAIT_LABELS = { mic: 'Разрешите микрофон…', sound: 'Готовлю звук…' }
// Отказ или ошибка микрофона и подсказка до первого диалога — raceMicHelp.js

/** Текст вопроса на плашке — реплика race_ask_voice (одна на плашку и на озвучку): из реплик настроек lines (правка в админке главнее), нет — из каталога */
export const askText = lines => lines?.[ASK_LINE]?.text || (RACE_LINES.find(l => l.id === ASK_LINE)?.text ?? '')

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
 *  watch(status) — статус модуля игры (phase): → значение, которое пора вернуть, или null. Пока виден попап (phase 'ask': ждём микрофон, микрофон не дали — выбор ещё можно поменять) и пока идёт игра ('game') — ждём;
 *  любая другая фаза (попап закрыт крестиком, игра кончилась, запуск не удался) — возврат.
 */
export function createTapGuard() {
  let prev = null
  return {
    begin(current) { if (prev == null) prev = !!current },
    watch(status) {
      if (prev == null) return null
      if (status?.phase === 'game' || status?.phase === 'ask') return null
      const back = prev
      prev = null
      return back
    },
    pending: () => prev != null,
  }
}
