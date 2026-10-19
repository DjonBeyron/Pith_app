import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneEditor from './SceneEditor.jsx'
import { sceneLinesText } from './sceneLinesText.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'

vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../scene/v2/scene-v2-cat.css', () => ({}))

const scene = { ...demoCafeScene, title: 'Кот на кухне' }
const data = { scene, mode: 'circle', crop: { x: 0, y: 0, scale: 0.75 } }
const html = ro => renderToStaticMarkup(<SceneEditor data={data} onPatch={() => {}} reg={null} ro={ro} />)

describe('режим разбора: нода scene в окне замечания', () => {
  it('«До» и «После»: название сцены и реплики (то, что говорит код); «кружок, без облачков»', () => {
    for (const ro of [true, false]) {
      const h = html(ro)
      expect(h).toContain('Кот на кухне')
      expect(h).toContain('кружок, без облачков')
      expect(h).toContain(sceneLinesText(scene).split('\n')[0].split(': ')[1].slice(0, 12).replace(/&/g, '&amp;'))
    }
  })
  it('«До» — реплики только для чтения, «После» — поле на каждую реплику (текст и перевод)', () => {
    const before = html(true)
    expect(before).toContain('Реплики сцены: что говорит код')
    expect(before).toContain('readOnly')
    const after = html(false)
    expect(after).not.toContain('readOnly')
    for (let i = 0; i < scene.timeline.length; i++) {
      expect(after).toContain(`data-line-text="${i}"`)
      expect(after).toContain(`data-line-tr="${i}"`)
    }
    expect(after).toContain('озвучка этой реплики сбрасывается')
  })
  it('контроллеры масштаба и положения — только в «После» (ro=false): рамка кружка, ползунок, «сбросить»', () => {
    expect(html(true)).not.toContain('data-scene-crop')
    const after = html(false)
    expect(after).toContain('data-scene-crop="circle"')
    expect(after).toContain('type="range"')
    expect(after).toContain('сбросить')
  })
})
