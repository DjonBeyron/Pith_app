import { useState } from 'react'

// Раунд «выбери из вариантов» для шторок «Дополни реплику» и «Картинка»: неверный вариант гаснет (можно пробовать
// дальше — вариантов всего три, неверных два), верный закрывает раунд и отдаёт итог { wrong, timeMs } тем же
// onFinishStats, что у плеера в «Выбери слово» (ядро игр пишет feed_game_answer). Один раз на раунд.

// Чистый шаг раунда: касание варианта i. state — { wrong: Set, solved: индекс | null }.
// → { state, finished }: finished — это касание закрыло раунд верным ответом (итог отдаётся один раз)
export function tapRound(state, i, { count, correctAt }) {
  if (state.solved != null || state.wrong.has(i) || !Number.isInteger(i) || i < 0 || i >= count) return { state, finished: false }
  if (i !== correctAt) return { state: { ...state, wrong: new Set([...state.wrong, i]) }, finished: false }
  return { state: { ...state, solved: i }, finished: true }
}

// Состояние кнопки варианта: 'idle' | 'wrong' | 'ok' | 'dim' (верный выбран — остальные тускнеют)
export function optionState(state, i) {
  if (state.solved === i) return 'ok'
  if (state.wrong.has(i)) return 'wrong'
  return state.solved != null ? 'dim' : 'idle'
}

//   count — сколько вариантов; correctAt — индекс верного; onFinishStats — итог раунда
// → { wrong: Set индексов, solved: индекс | null, stateOf(i), tap(i) }
export function useOptionRound({ count, correctAt, onFinishStats }) {
  const [state, setState] = useState(() => ({ wrong: new Set(), solved: null }))
  const [openedAt] = useState(() => Date.now()) // время — от открытия шторки, как у ядра игр

  function tap(i) {
    const step = tapRound(state, i, { count, correctAt })
    if (step.state === state) return
    setState(step.state)
    if (step.finished) onFinishStats?.({ wrong: state.wrong.size, timeMs: Date.now() - openedAt })
  }
  return { wrong: state.wrong, solved: state.solved, stateOf: i => optionState(state, i), tap }
}
