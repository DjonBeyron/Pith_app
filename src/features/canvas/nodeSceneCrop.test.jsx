import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import NodeSceneCrop from './NodeSceneCrop.jsx'
import NodeCropControls from './NodeCropControls.jsx'
import { demoCafeScene, demoOfficeScene } from '../scene/v2/demoScenes.js'

vi.mock('../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../scene/v2/scene-v2.css', () => ({}))
vi.mock('../scene/v2/scene-v2-cat.css', () => ({}))

// Редактор масштаба/положения сцены в ноде: тот же формат и панель, что у видео
describe('NodeSceneCrop — разметка редактора', () => {
  it('кружок: круглая рамка, содержимое в обёртке sceneCircleFit, ползунок и «сбросить»', () => {
    const html = renderToStaticMarkup(<NodeSceneCrop tData={{ scene: demoCafeScene, mode: 'circle' }} scene={demoCafeScene} mode="circle" onChange={() => {}} />)
    expect(html).toContain('data-scene-crop="circle"')
    expect(html).toContain('mediaCropFrameCircle')
    expect(html).toContain('playerSceneCircleInner')
    expect(html).toContain('type="range"')
    expect(html).toContain('min="0.5"')
    expect(html).toContain('max="4"')
    expect(html).toContain('сбросить')
    expect(html).toContain('100%')
  })

  it('пузырь: рамка 9:16 со слоем crop; масштаб/сдвиг из данных попадают в превью', () => {
    const tData = { scene: demoCafeScene, mode: 'bubble', crop: { x: 20, y: 0, scale: 1.5 } }
    const html = renderToStaticMarkup(<NodeSceneCrop tData={tData} scene={demoCafeScene} mode="bubble" onChange={() => {}} />)
    expect(html).toContain('data-scene-crop="bubble"')
    expect(html).toContain('playerSceneCrop')
    expect(html).toContain('translate(10%, 0%) scale(1.5)')
    expect(html).toContain('150%')
    expect(html).not.toContain('mediaCropFrameCircle')
  })

  it('одиночный кот в кружке — кадр solo (шире), как у плеера', () => {
    const solo = { ...demoOfficeScene, characters: { a: demoOfficeScene.characters.a } }
    const a = renderToStaticMarkup(<NodeSceneCrop tData={{ scene: solo }} scene={solo} mode="circle" onChange={() => {}} />)
    const b = renderToStaticMarkup(<NodeSceneCrop tData={{ scene: demoOfficeScene }} scene={demoOfficeScene} mode="circle" onChange={() => {}} />)
    const wOf = h => parseFloat(h.match(/playerSceneCircleInner" style="[^"]*?width:([\d.]+)px/)[1])
    expect(wOf(a)).toBeGreaterThan(wOf(b))
  })
})

describe('NodeCropControls — общая панель с видео', () => {
  it('классы mediaCrop* те же, что у NodeMediaCrop; ползунок только по запросу', () => {
    const plain = renderToStaticMarkup(<NodeCropControls scale={1.25} onZoom={() => {}} onReset={() => {}} />)
    expect(plain).toContain('mediaCropControls')
    expect(plain).toContain('mediaCropZoomBtn')
    expect(plain).toContain('mediaCropResetBtn')
    expect(plain).toContain('125%')
    expect(plain).not.toContain('type="range"')
    const withSlider = renderToStaticMarkup(<NodeCropControls scale={1} onZoom={() => {}} onReset={() => {}} slider={{ min: 0.5, max: 4, onChange: () => {} }} />)
    expect(withSlider).toContain('type="range"')
  })
})
