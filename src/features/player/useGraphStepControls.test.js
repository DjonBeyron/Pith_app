import { describe, it, expect, vi } from 'vitest'

// useCallback вне компонента — просто сама функция: проверяем логику шагов,
// а не React. Зависимости у колбэков стабильные (см. комментарий в файле)
vi.mock('react', () => ({ useCallback: fn => fn }))
const { useGraphStepControls } = await import('./useGraphStepControls.js')

function setup({ scheduled = null, pendingMs = 0, visible = [], fired = [], nodes = {} } = {}) {
  const log = { revealed: [], scheduled: [], cleared: 0 }
  const state = { visible: [...visible], pending: 'x', waiting: true }
  const refs = {
    scheduledRef: { current: scheduled }, nodeMapRef: { current: nodes }, firedRef: { current: new Set(fired) },
    scheduleReveal: { current: (id, force) => log.scheduled.push([id, force]) },
    pendingMsRef: { current: pendingMs }, visibleRef: { current: visible }, finishedRef: { current: true },
  }
  const api = useGraphStepControls({
    ...refs,
    clearTimers: () => { log.cleared++ },
    revealNode: n => log.revealed.push(n.id),
    setPendingNode: v => { state.pending = v },
    setIsWaiting: v => { state.waiting = v },
    setVisibleNodes: fn => { state.visible = fn(state.visible) },
  })
  return { api, refs, log, state }
}

const a = { id: 'a', triggers: [{ if: 'timer', then: 'b' }] }
const b = { id: 'b' }
const c = { id: 'c' }

describe('шаги дебага проигрывателя графа', () => {
  it('«показать сейчас»: без назначенного перехода — ничего', () => {
    expect(setup().api.revealNow()).toBe(false)
  })

  it('«показать сейчас»: назначенный reveal показывается сразу', () => {
    const t = setup({ scheduled: { type: 'reveal', nodeId: 'b' }, nodes: { b } })
    expect(t.api.revealNow()).toBe(true)
    expect(t.log.revealed).toEqual(['b'])
    expect(t.log.cleared).toBe(1)
    expect(t.refs.scheduledRef.current).toBe(null)
  })

  it('«показать сейчас»: таймер срабатывает один раз (дедуп firedRef)', () => {
    const t = setup({ scheduled: { type: 'timer', nodeId: 'a' }, nodes: { a } })
    expect(t.api.revealNow()).toBe(true)
    expect(t.log.scheduled).toEqual([['b', true]])
    expect(t.refs.firedRef.current.has('a:timer')).toBe(true)
    t.refs.scheduledRef.current = { type: 'timer', nodeId: 'a' }
    expect(t.api.revealNow()).toBe(false)
  })

  it('«сдвинуть время»: показывает, только когда отсчёт дошёл до нуля', () => {
    const t = setup({ scheduled: { type: 'reveal', nodeId: 'b' }, pendingMs: 500, nodes: { b } })
    expect(t.api.stepTime(200)).toBe(false)
    expect(t.refs.pendingMsRef.current).toBe(300)
    expect(t.api.stepTime(300)).toBe(true)
    expect(t.log.revealed).toEqual(['b'])
  })

  it('«шаг назад»: снимает последнее сообщение и забывает триггеры двух нод', () => {
    const t = setup({ visible: [a, b, c], fired: ['a:timer', 'b:word_correct', 'c:timer'] })
    expect(t.api.stepBack()).toEqual({ removed: c, last: b })
    expect([...t.refs.firedRef.current]).toEqual(['a:timer'])
    expect(t.state.visible.map(n => n.id)).toEqual(['a', 'b'])
    expect(t.refs.finishedRef.current).toBe(false)
    expect([t.state.pending, t.state.waiting]).toEqual([null, false])
  })

  it('«шаг назад» с одним сообщением — некуда', () => {
    expect(setup({ visible: [a] }).api.stepBack()).toBe(null)
  })
})
