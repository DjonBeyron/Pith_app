import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { normalizeSceneV2 } from '../../../scene/v2/sceneSchemaV2.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import { sandboxModule } from './sandboxModule.js'
import FeedSlideEntry from './FeedSlideEntry.jsx'
import SandboxSlide from './SandboxSlide.jsx'
import SandboxBar from './SandboxBar.jsx'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../../scene/v2/scene-v2-cat.css', () => ({}))
const feedScene = vi.hoisted(() => ({ value: { status: 'idle', scene: null } }))
vi.mock('../useFeedScene.js', () => ({ useFeedScene: () => feedScene.value }))
vi.mock('../../FeedSlide.jsx', () => ({ default: () => <section className="feedSlide" data-real="1" /> }))

const scene = normalizeSceneV2(demoOfficeScene)
const mod = sandboxModule({ scene, createdAt: 9 })
const props = { module: mod, slideKey: 3, active: true, near: true, tabVisible: true, soundOn: false, soundEverOn: false }

describe('слайд-песочница: только сцена и плашка, остальные слои не монтируются', () => {
  it('плашка «ТЕСТ · не в ленте пользователей» и обе кнопки', () => {
    feedScene.value = { status: 'ready', scene }
    const html = renderToStaticMarkup(<SandboxSlide {...props} />)
    expect(html).toContain('data-sandbox="1"')
    expect(html).toContain('ТЕСТ · не в ленте пользователей')
    expect(html).toContain('Закрыть тест')
    expect(html).toContain('Показать задание ещё раз')
    expect(html).toContain('slideSceneRoot') // сцена играет как у обычного слайда
  })
  it('нет слоёв обычного слайда: фраза, «Изучить фразу», HUD, лайки, «Ловля», «Помнишь?»', () => {
    feedScene.value = { status: 'ready', scene }
    const html = renderToStaticMarkup(<SandboxSlide {...props} />)
    for (const bad of ['feedPhraseBlock', 'feedLearnBtn', 'Изучить фразу', 'feedHud', 'feedLike', 'catchSpoilerWrap', 'catchOverChip', 'catchCover', 'feedPhraseStack', 'WordTranslate']) {
      expect(html).not.toContain(bad)
    }
  })
  it('сцена не прошла проверку → заглушка, лента не ломается', () => {
    feedScene.value = { status: 'invalid', scene: null }
    const html = renderToStaticMarkup(<SandboxSlide {...props} />)
    expect(html).toContain('sbxBad')
    expect(html).toContain('ТЕСТ')
  })
  it('«Показать задание ещё раз» неактивна, если в сцене нет задания', () => {
    const none = renderToStaticMarkup(<SandboxBar hasTask={false} onClose={() => {}} onAgain={() => {}} />)
    expect(none).toMatch(/<button[^>]*disabled=""[^>]*>\s*Показать задание ещё раз/)
    const has = renderToStaticMarkup(<SandboxBar hasTask onClose={() => {}} onAgain={() => {}} />)
    expect(has).not.toMatch(/disabled=""/)
  })
})

describe('FeedSlideEntry — выбор слайда по флагу isSandbox', () => {
  it('песочница → SandboxSlide, обычный модуль → обычный FeedSlide', () => {
    feedScene.value = { status: 'ready', scene }
    expect(renderToStaticMarkup(<FeedSlideEntry {...props} />)).toContain('data-sandbox="1"')
    const real = renderToStaticMarkup(<FeedSlideEntry {...props} module={{ id: 'm1', title: 'x' }} />)
    expect(real).toContain('data-real="1"')
    expect(real).not.toContain('data-sandbox')
  })
})
