import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import FeedFramePreview from './FeedFramePreview.jsx'
import FeedSlideLayers from './FeedSlideLayers.jsx'
import FeedFrameControls from './FeedFrameControls.jsx'
import {
  setFeedFrame, previewSlideSpec, previewCalc, longestLineIndex, previewZoom, feedFrameSummary, frameKey, deviceById,
} from './feedFrameModel.js'
import { computeFeedFrame } from '../../../feed/scene/feedFrameCalc.js'
import { FEED_DEVICES, feedZones, navHeight } from '../../../feed/scene/feedSlideGeometry.js'
import { normalizeSceneV2 } from '../../../scene/v2/sceneSchemaV2.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import { helpContent } from '../scenesHelp.js'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../../scene/v2/scene-v2-cat.css', () => ({}))

const scene = normalizeSceneV2(demoOfficeScene)
const html = (device, frame, extra = {}) => {
  const calc = previewCalc(device, frame)
  return renderToStaticMarkup(
    <FeedFramePreview scene={scene} device={device} frame={frame ?? { scale: 1, x: 0, y: 0, anchor: 'bottom' }} calc={calc} zoom={0.5} lineIndex={0} showZones onDrag={() => {}} onCommit={() => {}} {...extra} />,
  )
}

describe('предпросмотр «Как в ленте»: разметка', () => {
  it('настоящий слайд ленты: .feedSlide, сцена, блок фразы с шариками, HUD, кнопка, нижняя панель, слой перетаскивания', () => {
    const out = html(FEED_DEVICES[0])
    for (const cls of ['feedSlide ffpSlide', 'slideSceneRoot', 'scn__svg', 'feedPhraseBlock', 'phraseBubbleStatic', 'feedPhraseSub', 'feedHud', 'feedHudBtn', 'feedLearnBtn', 'Изучить фразу', 'shellV2Nav', 'ffpDrag', 'feedPauseGuard']) {
      expect(out, cls).toContain(cls)
    }
    // статичный кадр с облачком выбранной реплики
    expect(out).toContain('scn-bubble')
  })

  it('размер слайда и переменные оболочки — по устройству: --v2-nav-h = кнопки + safe-area, --feed-sat, масштаб рамки', () => {
    const d = deviceById('iphone')
    const out = html(d)
    expect(out).toContain(`width:${d.w}px;height:${d.h}px`)
    expect(out).toContain('--v2-nav-h:74px')
    expect(out).toContain('--feed-sat:47px')
    expect(out).toContain('transform:scale(0.5)')
    expect(out).toContain(`width:${d.w * 0.5}px;height:${d.h * 0.5}px`)
    expect(html(deviceById('android'))).toContain('--v2-nav-h:40px')
  })

  it('плашки зон — те же прямоугольники, что в расчёте ленты (feedZones), подпись у каждой', () => {
    for (const d of FEED_DEVICES) {
      const spec = previewSlideSpec(d)
      const zones = feedZones({ w: d.w, h: d.h, navH: navHeight(d.sab), safeTop: d.sat })
      const out = html(d)
      for (const z of zones) {
        expect(out).toContain(`data-zone="${z.id}"`)
        const px = v => (v === 0 ? '0' : `${v}px`) // React пишет 0 без единиц
        expect(out).toContain(`left:${px(z.l)};top:${px(z.t)};width:${px(z.r - z.l)};height:${px(z.b - z.t)}`)
        expect(out).toContain(z.label)
      }
      expect(spec.navH).toBe(navHeight(d.sab))
    }
  })

  it('зона, которую задели коты, подсвечена (ffpZoneHit)', () => {
    const d = FEED_DEVICES[0]
    expect(html(d)).not.toContain('ffpZoneHit')
    const bad = { scale: 1, x: 0, y: 0.3, anchor: 'bottom' }
    const out = html(d, bad)
    expect(out).toContain('ffpZoneHit')
    expect(previewCalc(d, bad).warnings.length).toBeGreaterThan(0)
  })

  it('без зон плашек нет', () => {
    expect(html(FEED_DEVICES[0], undefined, { showZones: false })).not.toContain('ffpZones')
  })
})

describe('предпросмотр = лента: общая геометрия', () => {
  it('previewCalc даёт ровно то, что считает лента по тем же размерам (размер слайда, панель, safe-area)', () => {
    for (const d of FEED_DEVICES) {
      const frame = { scale: 1.1, x: 0.05, y: -0.02, anchor: 'center' }
      const feed = computeFeedFrame({ w: d.w, h: d.h, navH: navHeight(d.sab), safeTop: d.sat, frame })
      expect(previewCalc(d, frame)).toEqual(feed)
    }
  })

  it('слои макета — настоящие классы ленты (есть в её CSS), а не свои', () => {
    const layers = renderToStaticMarkup(<FeedSlideLayers />)
    for (const cls of ['feedPhraseBlock', 'feedPhraseStack', 'feedPhrase', 'feedHud', 'feedLearnBtn', 'shellV2Nav']) expect(layers).toContain(cls)
  })
})

describe('feedFrameModel', () => {
  it('setFeedFrame: кадр по умолчанию / null убирают поле, остальное нормализуется; другие options целы', () => {
    const base = { ...scene, options: { ...scene.options, display: 'both', feedFrame: { scale: 1.3, x: 0, y: 0 } } }
    expect(setFeedFrame(base, null).options.feedFrame).toBeUndefined()
    expect(setFeedFrame(base, { scale: 1, x: 0, y: 0, anchor: 'bottom' }).options.feedFrame).toBeUndefined()
    expect(setFeedFrame(base, null).options.display).toBe('both')
    expect(setFeedFrame(scene, { scale: 9, x: 0.5, y: 0 }).options.feedFrame).toEqual({ scale: 1.6, x: 0.5, y: 0 })
    expect(setFeedFrame(scene, { scale: 1, x: 0, y: 0, anchor: 'top' }).options.feedFrame.anchor).toBe('top')
    expect(scene.options.feedFrame).toBeUndefined() // исходная сцена не изменена
  })

  it('longestLineIndex, previewZoom, frameKey, summary', () => {
    expect(scene.timeline[longestLineIndex(scene)].text.length).toBe(Math.max(...scene.timeline.map(l => l.text.length)))
    expect(previewZoom(FEED_DEVICES[0], 390)).toBeLessThanOrEqual(560 / 844 + 1e-9)
    expect(previewZoom(FEED_DEVICES[0], 100)).toBeCloseTo(100 / 390, 5)
    expect(previewZoom(FEED_DEVICES[0], 0)).toBe(1)
    expect(frameKey(undefined)).toBe(frameKey({ scale: 1, x: 0, y: 0, anchor: 'bottom' }))
    expect(feedFrameSummary(undefined)).toMatch(/по умолчанию/)
    expect(feedFrameSummary({ scale: 1.2, x: 0, y: -0.05, anchor: 'center' })).toBe('×1.2, X 0, Y −0.05, якорь: центр')
  })

  it('«?» кадрирования есть в справке сборщика', () => {
    for (const k of ['feed_frame', 'feed_frame_device', 'feed_frame_scale', 'feed_frame_shift', 'feed_frame_anchor', 'feed_frame_zones']) {
      expect(helpContent(k)?.body?.length, k).toBeGreaterThan(20)
    }
  })
})

describe('FeedFrameControls', () => {
  it('экраны, ползунки (масштаб 0.6–1.6, X/Y −1…1), якорь, «Сбросить», зоны', () => {
    const out = renderToStaticMarkup(
      <FeedFrameControls device={deviceById('iphone')} onDevice={() => {}} frame={{ scale: 1, x: 0, y: 0, anchor: 'bottom' }} onChange={() => {}} onReset={() => {}} isDefault showZones onZones={() => {}} />,
    )
    for (const t of ['iPhone 390×844', '12 mini 375×812', 'Android 360×780', 'Pro Max 430×932', 'Масштаб', 'Сдвиг по горизонтали', 'Сдвиг по вертикали', 'Верх', 'Центр', 'Низ', 'Сбросить', 'опасные зоны']) expect(out).toContain(t)
    expect(out).toContain('min="0.6"')
    expect(out).toContain('max="1.6"')
    expect(out).toContain('min="-1"')
    expect(out).toMatch(/Сбросить<\/button>/)
    expect(out).toContain('disabled')
  })
})
