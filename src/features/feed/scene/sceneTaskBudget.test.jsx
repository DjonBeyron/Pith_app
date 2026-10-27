import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PromptSlotContext } from '../../../shared/lib/prompts/usePromptSlotContext.js'
import { useSceneTask } from './useSceneTask.js'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'
import { TASK_EXAMPLE } from '../../scene/v2/sceneLegend.js'

vi.mock('../../../shared/lib/analytics/track.js', () => ({ track: () => {} }))

// «О чём диалог» под единым бюджетом Пита: в конце круга решение «показать» принимает onState. Статический рендер
// (DOM-среды нет) — детектор круга и ворота работают без эффектов
const scene = normalizeSceneV2({ ...demoCafeScene, ...TASK_EXAMPLE })
const END = { status: 'ended', index: scene.timeline.length - 1, total: scene.timeline.length }
const slotWith = current => ({ current, request: vi.fn(), cancel: vi.fn(), answer: vi.fn(), dismiss: vi.fn() })
const makeGate = () => ({ forced: () => false, claim: vi.fn(() => true), why: () => null, later: vi.fn() })

function lap(slot) {
  const gate = makeGate()
  let task
  const Probe = () => {
    task = useSceneTask({ scene, sceneId: 'sc1', active: true, live: true, apiRef: { current: {} }, onLock: () => {}, gate })
    return null
  }
  const ui = <Probe />
  renderToStaticMarkup(slot === undefined ? ui : <PromptSlotContext.Provider value={slot}>{ui}</PromptSlotContext.Provider>)
  vi.spyOn(console, 'error').mockImplementation(() => {}) // setState вне рендера у серверного компонента — шум
  task.onState(END)
  return gate
}

describe('useSceneTask под бюджетом', () => {
  afterEach(() => vi.restoreAllMocks())
  it('без хоста слота задание решается старыми лимитами, как раньше', () => {
    expect(lap(undefined).claim).toHaveBeenCalledWith('sc1')
  })
  it('слот сцену не выбрал — старые лимиты не тратятся, задание не показывается', () => {
    expect(lap(slotWith(null)).claim).not.toHaveBeenCalled()
  })
  it('слот выбрал именно эту сцену — показ, слот освобождается', () => {
    const slot = slotWith({ id: 'scene:sc1', kind: 'question', reason: 'game_offer' })
    expect(lap(slot).claim).toHaveBeenCalledWith('sc1')
    expect(slot.answer).toHaveBeenCalledWith('shown')
  })
})
