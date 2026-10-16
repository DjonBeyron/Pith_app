import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneFullscreenView from './SceneFullscreenView.jsx'
import SceneBubbleView from './SceneBubbleView.jsx'
import { fsCoverFrame, FS_PAD } from './sceneFullscreenModel.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

// Портал в SSR не поддержан — для проверки раскладки отдаём детей как есть
vi.mock('react-dom', async orig => ({ ...(await orig()), createPortal: c => c }))
vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../../scene/v2/scene-v2-cat.css', () => ({}))

vi.stubGlobal('document', { body: {} }) // createPortal(…, document.body) — аргумент считается до вызова мока
const css = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const count = (html, re) => (html.match(re) ?? []).length

const fsProps = {
  scene: demoOfficeScene, showBubbles: true, display: null, voice: null, paused: false, sound: true, muted: false, rate: 1,
  audioSrcOf: null, status: 'paused', index: 0, run: 1, at: 0, apiRef: { current: null }, onState: () => {},
  onTogglePause: () => {}, onClose: () => {}, rootRef: { current: null },
}

describe('полный экран сцены — раскладка как у видео', () => {
  it('на паузе: ОДИН play по центру, звук слева сверху, крестик, полоса прогресса; нижней панели и второго play нет', () => {
    const html = renderToStaticMarkup(<SceneFullscreenView {...fsProps} />)
    expect(count(html, /playerScenePlay"/g)).toBe(1) // единственный значок play (по центру кадра)
    expect(html).not.toContain('playerSceneFsBar')
    expect(html).not.toContain('playerSceneFsBtn')
    expect(count(html, /<button/g)).toBe(2) // крестик + звук; кнопки play/pause нет
    expect(html).toContain('videoFullClose videoFsMute')
    expect(html).toContain('aria-label="Закрыть"')
    expect(html).toContain('aria-label="Без звука"')
    expect(html).toContain('videoFsProgressTrack')
  })

  it('играет: значка play нет вовсе (как у видео — пауза по тапу), кнопка звука остаётся', () => {
    const html = renderToStaticMarkup(<SceneFullscreenView {...fsProps} status="playing" />)
    expect(html).not.toContain('playerScenePlay')
    expect(html).toContain('videoFsMute')
  })

  it('после конца — один значок «заново»; без звука — кнопка в нажатом состоянии «Включить звук»', () => {
    const ended = renderToStaticMarkup(<SceneFullscreenView {...fsProps} status="ended" muted sound={false} />)
    expect(count(ended, /playerScenePlay"/g)).toBe(1)
    expect(ended).toContain('aria-label="Включить звук"')
    expect(ended).toContain('aria-pressed="true"')
  })

  it('CSS: звук — зеркально крестику (слева, тот же размер/класс), safe-area сверху и слева; нижней панели в стилях нет', () => {
    const fs = css('../../../../styles/player/modules/scene-fs.css')
    expect(fs).toMatch(/\.playerSceneFsControls \.videoFsMute \{[^}]*left: max\(16px, env\(safe-area-inset-left/)
    expect(fs).toMatch(/\.playerSceneFsControls \.videoFullClose \{[^}]*safe-area-inset-top/)
    expect(fs).not.toContain('playerSceneFsBar')
    expect(fs).not.toContain('playerSceneFsBtn')
  })

  it('геометрия: без нижней панели кадр не уже прежнего, под полосой прогресса остаётся FS_PAD.bottom; safe-area 402×874 не перекрывает кнопки', () => {
    expect(FS_PAD.bottom).toBeLessThan(40)
    const f = fsCoverFrame({ w: 402, h: 874 }, { safeTop: 62, safeBottom: 34 })
    const yOf = v => f.top + v / 640 * f.height
    expect(yOf(270)).toBeGreaterThanOrEqual(62 + 8 + 36) // облачко ниже кнопок сверху (safe-area 62 + отступ + кнопка)
    expect(yOf(612)).toBeLessThanOrEqual(874 - 34) // ноги котов выше нижней safe-area
  })
})

describe('полоса прогресса в пузыре — как у видео', () => {
  const base = {
    scene: demoOfficeScene, showBubbles: true, isHistory: false, pending: false, status: 'playing', index: 0, run: 1, at: 0,
    paused: false, sound: true, rate: 1, apiRef: { current: null }, rootRef: { current: null }, onState: () => {}, onTap: () => {},
  }
  it('есть полоса (классы полосы видео), точек реплик нет; у истории полосы нет', () => {
    const html = renderToStaticMarkup(<SceneBubbleView {...base} />)
    expect(html).toContain('videoFsProgressTrack playerSceneBubbleTrack')
    expect(html).toContain('videoFsProgressBar playerSceneFsProgress')
    expect(html).not.toContain('scn__progress')
    expect(html).not.toContain('scn__dot')
    expect(renderToStaticMarkup(<SceneBubbleView {...base} isHistory />)).not.toContain('playerSceneBubbleTrack')
  })
  it('счётчика времени нет (у видео в ленте его тоже нет)', () => {
    expect(renderToStaticMarkup(<SceneBubbleView {...base} />)).not.toMatch(/\d:\d\d/)
  })
})
