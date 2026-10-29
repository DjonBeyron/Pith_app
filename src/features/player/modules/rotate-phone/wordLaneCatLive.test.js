import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const weak = vi.hoisted(() => ({ on: false }))
vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => weak.on }))

const { default: WordLaneCat } = await import('./WordLaneCat.jsx')
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const markup = () => renderToStaticMarkup(createElement(WordLaneCat, { apiRef: { current: null } }))

describe('кот игры — «живой Пит v2» подключён', () => {
  it('обычное устройство: корень scn scn--v2 wlCat, без scn--live и scn--lite; общий родитель голов .scn-cat один', () => {
    weak.on = false
    const html = markup()
    const root = /<div[^>]*data-testid="wl-cat"[^>]*>/.exec(html)[0]
    expect(root).toMatch(/class="scn scn--v2 wlCat"/)
    expect(root).not.toContain('scn--live')
    expect(root).not.toContain('scn--lite')
    expect(html.match(/class="scn-cat"/g)).toHaveLength(1)
    expect(html.match(/data-part="head"/g)).toHaveLength(3)
  })

  it('слабое устройство: добавляется scn--lite (зрачки и усы выключены, остаётся рот)', () => {
    weak.on = true
    const root = /<div[^>]*data-testid="wl-cat"[^>]*>/.exec(markup())[0]
    expect(root).toMatch(/class="scn scn--v2 wlCat scn--lite"/)
    weak.on = false
  })

  it('усы без scn--live: по одной анимации на ус и только при is-talking; на lite анимаций нет', () => {
    const css = read('../../../../styles/player/modules/word-lane.css')
    expect(css).toContain('.wlCat.scn--v2 .scn-cat.is-talking .wh-l { animation: scnWhiskL 0.6s ease-in-out infinite; }')
    expect(css).toContain('.wlCat.scn--v2 .scn-cat.is-talking .wh-r { animation: scnWhiskR 0.6s ease-in-out infinite; }')
    expect(css).toContain('.wlCat.scn--v2 .scn-cat.is-talking .wh-d { animation-duration: 0.72s; animation-delay: -0.25s; }')
    expect(css).toContain('.wlCat.scn--lite .wh { animation: none; }')
  })

  it('--talk не переходит на корне кота (перепросчёт стилей всего поддерева каждый кадр), а только у усов', () => {
    const css = read('../../../../styles/player/modules/word-lane.css')
    expect(css).toContain('.wlCat .scn-cat { transition: none; }')
    expect(css).toContain('.wlCat .wh { transition: --talk 0.3s ease-in-out; }')
  })

  it('кот подключает стили зрачков и усов и не использует rAF для взгляда', () => {
    const cat = read('./WordLaneCat.jsx')
    expect(cat).toContain("import '../../../scene/v2/scene-v2-pit.css'")
    const voice = read('./wordLaneCatVoice.js') // рот: микрофон / реплика
    expect(voice).toContain('look.talking(level >= VOICE_AT)')
    expect(voice).toContain('look.lineStart(); look.talking(true)')
    expect(voice).toContain('look.lineEnd(); look.talking(false)')
    expect(voice.match(/requestAnimationFrame/g)).toHaveLength(1) // rAF только в значении по умолчанию: один цикл на реплику, новых циклов нет
    expect(cat).toContain('createCatVoice(')
    expect(cat).toContain('look.idle(true)')
    expect(cat).toContain('look.idle(false)')
    expect(read('./wordLaneCatLook.js')).not.toContain('requestAnimationFrame')
  })

  it('игра зовёт взгляд кота: слово ученика, пилюли диктора, начало очередей', () => {
    const flow = read('./useWordLaneFlow.js')
    expect(flow).toContain('catApi?.current?.look?.word()') // слово ученика (onChange слушателя)
    expect(flow).toContain("look()?.word(), left(pc.at)") // пилюли диктора
    expect(flow).toContain('look()?.lineStart()')
    expect(flow).toContain('look()?.lineEnd()')
  })
})
