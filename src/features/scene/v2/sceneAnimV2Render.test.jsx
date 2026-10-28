import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneRenderer from './SceneRenderer.jsx'
import { normalizeSceneV2 } from './sceneSchemaV2.js'
import { demoMascotScene } from './demoScenes.js'
import { buildMascot } from './sprites/mascot/mascotSprite.js'
import { countNodes, treeToString } from './sprites/svgTree.js'
import { setAnimV2 } from './animFlags.js'
import { MASCOT_PACKS, SKIN_TITLES } from './sprites/mascot/mascots.js'

// «Живой Пит v2» в рендерере: класс .scn--v2 (стили зрачков и усов) только при флаге / явном пропе и только в живом режиме;
// усы — класс wh на существующем контуре (без новых узлов); маскот переименован в «Пит»
vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))

const scene = normalizeSceneV2(demoMascotScene)

function fakeStorage() {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}

describe('SceneRenderer — animV2', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', fakeStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('по умолчанию класса нет; проп animV2 включает / выключает явно; флаг админки включает без пропа, явный false сильнее', () => {
    const cls = html => html.match(/class="(scn [^"]*)"/)[1]
    expect(cls(renderToStaticMarkup(<SceneRenderer scene={scene} />))).not.toContain('scn--v2')
    expect(cls(renderToStaticMarkup(<SceneRenderer scene={scene} animV2 />))).toContain('scn--v2')
    setAnimV2(true)
    expect(cls(renderToStaticMarkup(<SceneRenderer scene={scene} />))).toContain('scn--v2')
    expect(cls(renderToStaticMarkup(<SceneRenderer scene={scene} animV2={false} />))).not.toContain('scn--v2')
  })

  it('статичный кадр без класса даже при флаге (он без анимаций)', () => {
    setAnimV2(true)
    expect(renderToStaticMarkup(<SceneRenderer scene={scene} mode="static" frameIndex={0} />)).not.toContain('scn--v2')
  })

  it('усы Пита адресуемы: ровно один контур с классом wh, число узлов маскота не выросло; у Мии усов нет', () => {
    const kit = treeToString(buildMascot('kit'))
    expect(kit.match(/class="wh"/g)).toHaveLength(1)
    expect(treeToString(buildMascot('mia'))).not.toContain('class="wh"')
    expect(countNodes(buildMascot('kit'))).toBeLessThanOrEqual(100)
    // класс поставлен на уже существующий path: в разметке головы по-прежнему тот же набор тегов
    expect(MASCOT_PACKS.kit.head.match(/<path class="wh" d="M145\.1 327\.2/g)).toHaveLength(1) // усы, а не дужки очков (mascotWhiskers.test.js)
  })

  it('в подписях фиолетовый маскот называется просто «Пит»; идентификатор скина kit не менялся', () => {
    expect(SKIN_TITLES.kit).toBe('Пит')
    expect(MASCOT_PACKS.kit.id).toBe('kit')
    expect(MASCOT_PACKS.kit.title).toBe('Пит')
    expect(SKIN_TITLES.mia).toContain('Мия')
  })
})
