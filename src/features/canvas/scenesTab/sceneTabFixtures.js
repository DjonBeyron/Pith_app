import { demoPitCircleScene, demoOfficeScene, demoTemplateScene } from '../../scene/v2/demoScenes.js'

// Тестовые ноды канваса для вкладки «Сцены» (используются только в *.test.*)
export const sceneNode = (id, seq, scene, extra = {}) => ({
  id, seq, x: seq * 300, y: 0, size: 'max', type: 'scene', triggers: [{ if: 'played', then: null }],
  typeData: { scene: { scene, sceneId: null, mode: 'bubble', showBubbles: true, start: 'auto', startDelayMs: 500, ...extra } },
})
export const textNode = (id, seq) => ({ id, seq, x: seq * 300, y: 0, type: 'text', triggers: [{ if: 'played', then: null }], typeData: { text: { content: 'Hi' } } })

export const fixtureNodes = () => [
  sceneNode('n1', 1, demoPitCircleScene, { mode: 'circle' }),
  textNode('t1', 2),
  sceneNode('n2', 3, demoOfficeScene),
  textNode('t2', 4),
  sceneNode('n3', 5, demoTemplateScene, { mode: 'circle' }),
  textNode('t3', 6),
  sceneNode('n4', 7, demoPitCircleScene, { mode: 'circle' }),
]
