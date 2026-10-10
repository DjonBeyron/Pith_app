/* eslint-disable react-hooks/rules-of-hooks -- хук вызывается вне компонента намеренно: react в тесте подменён (см. sayCantXp.test.js) */
import { buildXpMap } from './lessonXp.js'
import { sayExit } from './sayPairSkip.js'
import { starsFromErrors } from '../../shared/lib/lessonStars.js'
import { SAY_DONE } from '../../shared/lib/speech/sayTriggers.js'
import { useSayCantXp } from './useSayCantXp.js'

// Модель плеера для sayCantXp.test.js (не тест): настоящие buildXpMap / sayExit / useSayCantXp / реестр; повторяет контракты LessonPlayer.jsx и useGraphPlayer.onNodeDone.
// Хуку нужен React-рантайм, которого вне компонента нет, — sayCantXp.test.js подменяет 'react' (vi.mock: useState отдаёт значение, useCallback — функцию)

export const node = (id, type, triggers = [], data = {}) => ({ id, type, typeData: { [type]: data }, triggers: triggers.map(([iff, then]) => ({ if: iff, then })) })
export const text = (id, next) => node(id, 'text', next ? [['timer', next]] : [])
export const word = (id, next) => node(id, 'word_choice', [['word_correct', next]])
export const say = (id, done, wrong, data) => node(id, 'say_phrase', [['say_done', done], ['say_wrong', wrong]].filter(t => t[1]), data)

export function makePlayer(nodes, lessonXp) {
  const map = Object.fromEntries(nodes.map(n => [n.id, n]))
  const xpMap = buildXpMap(nodes, lessonXp)
  const earnedXpRef = { current: 0 }
  let state = 0
  const deltas = [] // на сколько вырос счётчик при каждом начислении
  const setEarnedXp = fn => { const next = fn(state); if (next !== state) deltas.push(next - state); state = next }
  const fired = new Set()
  const log = { moves: [], calls: 0 }
  // useGraphPlayer.onNodeDone для say_phrase: sayExit + дедуп по ключу «нода:итог»
  const graphDone = (id, result) => {
    log.calls += 1
    const to = sayExit(map, map[id], result)
    if (!to) return
    const key = `${id}:${result}`
    if (fired.has(key)) return
    fired.add(key)
    log.moves.push(to)
  }
  const sx = useSayCantXp({ onNodeDone: graphDone, xpMap, earnedXpRef, setEarnedXp })
  // LessonPlayer.handleXpEarned
  const handleXpEarned = (amount, nodeId) => {
    const add = sx.credit(nodeId, amount)
    setEarnedXp(prev => { earnedXpRef.current = prev + add; return prev + add })
  }
  // LessonPlayer.rollbackNode (XP и реестр; шаг назад админа)
  const rollbackNode = id => {
    sx.revoke(id)
    const xp = xpMap.get(id) ?? 0
    if (xp > 0) earnedXpRef.current = Math.max(0, earnedXpRef.current - xp)
  }
  // Панель «Сказать фразу» (SayPhrasePanel.finish): XP — только на успехе; say_wrong и say_cant сами XP не начисляют (их тихо засчитывает хук)
  const sayPanel = (id, outcome) => {
    if (outcome === SAY_DONE) { const xp = xpMap.get(id) ?? 0; if (xp > 0) handleXpEarned(xp, id) }
    sx.onNodeDone(id, outcome)
  }
  const wordPanel = id => { const xp = xpMap.get(id) ?? 0; if (xp > 0) handleXpEarned(xp, id); sx.onNodeDone(id, 'word_correct') }
  return { map, xpMap, earnedXpRef, deltas, log, sx, handleXpEarned, rollbackNode, sayPanel, wordPanel, get earned() { return earnedXpRef.current } }
}

/** Прохождение сценария от входа: outcomes — итог каждого say-модуля. Возвращает XP, показанные ноды, ошибки (для звёзд) */
export function playLesson(nodes, lessonXp, outcomes) {
  const p = makePlayer(nodes, lessonXp)
  const incoming = new Set(nodes.flatMap(n => n.triggers.map(t => t.then)))
  let cur = nodes.find(n => !incoming.has(n.id)).id
  const shown = []
  for (let guard = 0; cur && guard < 50; guard += 1) {
    const n = p.map[cur]
    shown.push(cur)
    p.log.moves.length = 0
    if (n.type === 'say_phrase') {
      p.sayPanel(cur, outcomes[cur])
      cur = p.log.moves[0]?.then ?? null
    } else if (n.type === 'word_choice') {
      p.wordPanel(cur)
      cur = n.triggers[0].then
    } else cur = n.triggers[0]?.then ?? null
  }
  return { p, shown, xp: p.earned, wrong: 0, stars: starsFromErrors(0) }
}

