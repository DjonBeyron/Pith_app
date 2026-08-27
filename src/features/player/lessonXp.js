// Раздача XP урока по нодам с наградой.
//
// XP урока делится поровну между всеми нодами, где включена галочка
// «Получить награду». Остаток от деления раздаётся первым нодам по одному —
// иначе часть XP просто терялась бы.
import { isRewardOn } from '../../shared/lib/nodeReward.js'

export const REWARD_TYPES = ['word_choice', 'phrase_assembly', 'photo_choice', 'table']

export function rewardNodes(nodes) {
  return nodes.filter(n =>
    REWARD_TYPES.includes(n.type) && isRewardOn(n.type, n.typeData?.[n.type])
  )
}

// Наградных нод бывает больше, чем XP урока: при делении последним доставался
// ноль — галочка «Получить награду» стоит, а в чате ничего не прилетает.
// Меньше единицы не даём: сумма может чуть превысить XP урока, зато награда
// видна везде, где автор её включил.
const MIN_XP = 1

// Map<nodeId, xp>. Пусто, если у урока нет XP или нет наградных нод.
export function buildXpMap(nodes, lessonXp) {
  if (!lessonXp) return new Map()
  const list = rewardNodes(nodes)
  if (!list.length) return new Map()
  const base      = Math.floor(lessonXp / list.length)
  const remainder = lessonXp % list.length
  return new Map(list.map((n, i) =>
    [n.id, Math.max(MIN_XP, base + (i < remainder ? 1 : 0))]))
}
