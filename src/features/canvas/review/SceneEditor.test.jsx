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
      expect(h).toContain('Реплики сцены: что говорит код')
      expect(h).toContain(sceneLinesText(scene).split('\n')[0].replace(/&/g, '&amp;'))
    }
  })
  it('контроллеры масштаба и положения — только в «После» (ro=false): рамка кружка, ползунок, «сбросить»', () => {
    expect(html(true)).not.toContain('data-scene-crop')
    const after = html(false)
    expect(after).toContain('data-scene-crop="circle"')
    expect(after).toContain('type="range"')
    expect(after).toContain('сбросить')
  })
})
