import { describeLevel } from '../../../shared/lib/level/levelModel.js'
import { getLevel } from '../../../shared/lib/level/levelFeed.js'
import { loadState } from '../../../shared/lib/prompts/promptStore.js'
import { localToday } from '../../review/reviewDecks.js'
import { daySeed } from '../feedKnowledge.js'
import { LADDER_MIN_SESSIONS, LADDER_MAX_TRIES } from './ladderRules.js'
import { planLadder, planFromIds } from './ladderPlan.js'
import { loadLadder } from './ladderStore.js'

// Включена ли лесенка. Чистая функция над окружением env = { record, sessions, today, confident }:
//   record    — запись ladderStore (null — firstDay не известен: первая загрузка или старый пользователь → не показываем);
//   sessions  — счётчик визитов бюджета Пита (pithy_prompts_v1.sessions, +1 на загрузку страницы);
//   today     — сегодня по часам устройства; лесенка — только в ДРУГОЙ день, чем firstDay (второй визит, а не вторая вкладка);
//   confident — модель уровня уже уверена в человеке (describeLevel().confident) — измерять незачем.
export function ladderActive({ record, sessions, today, confident }) {
  if (!record?.firstDay || record.done) return false
  if (sessions < LADDER_MIN_SESSIONS || record.firstDay === today || confident) return false
  if (record.shownDay !== today && record.tries >= LADDER_MAX_TRIES) return false // новая попытка, а попытки кончились
  return true
}

// Окружение из реальных источников (ленивое чтение: вызывается в момент решения, не при импорте)
export function readLadderEnv() {
  return {
    record: loadLadder(),
    sessions: loadState().sessions,
    today: localToday(),
    confident: describeLevel(getLevel()).confident,
  }
}

// Решение на эту загрузку страницы: [] — лесенки нет, иначе план [{ id, difficulty }].
// Перезагрузка в тот же день, пока лесенка не пройдена, берёт те же фразы (сохранённые ids), иначе — новый план по сиду дня.
// modules — не начатые фразы ленты (после ранжирования)
export function decideLadder(modules, env) {
  if (!ladderActive(env)) return []
  const { record, today } = env
  if (record.shownDay === today && record.ids.length) {
    const same = planFromIds(record.ids, modules)
    if (same.length) return same
  }
  return planLadder(modules, { seed: daySeed(today) }) ?? []
}
