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

  it('усы без scn--live качает JS (whiskerDrive.js), а не CSS: в word-lane.css ни animation, ни перехода амплитуды у .wh; кот создаёт привод по умолчанию, на lite — NO_LOOK', () => {
    const css = read('../../../../styles/player/modules/word-lane.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/\.wh[^{]*\{/)
    expect(css).not.toContain('--wh-amp')
    expect(css).not.toContain('is-tail')
    const look = read('./wordLaneCatLook.js')
    expect(look).toContain('whiskers = createWhiskerDrive({ getRoot })')
    expect(read('./WordLaneCat.jsx')).toContain('lite ? NO_LOOK : createCatLook(')
  })

  it('--talk не переходит на корне кота (перепросчёт стилей всего поддерева каждый кадр)', () => {
    const css = read('../../../../styles/player/modules/word-lane.css')
    expect(css).toContain('.wlCat.scn--v2 .scn-cat { transition: none; }') // специфичнее общего правила сцен (scene-v2-pit.css), порядок подключения не важен
    expect(css).not.toContain('--talk 0.3s')
  })

  it('голова прячется плавно (ease-in-out, без отскока), а выскакивает с пружиной; смена лица — перекрёстное проявление', () => {
    const css = read('../../../../styles/player/modules/word-lane.css')
    expect(css).toMatch(/\.wlStage > \.wlCat\.scn \{[^}]*transition: transform 0\.42s cubic-bezier\(0\.4, 0, 0\.6, 1\)/)
    expect(css).toMatch(/\.wlCat--up \{[^}]*transition: transform 0\.55s cubic-bezier\(0\.34, 1\.45, 0\.5, 1\)/)
    expect(css).toContain(".wlCat [data-part='head'].wlHead--out { display: inline; }")
    expect(read('./WordLaneCat.jsx')).toContain('crossfadeHeads(prevHead')
  })

  it('пауза игры (freeze) гасит усы без выдержки, но не рывком: look.release() → привод усов плавно ведёт амплитуду к нулю', () => {
    expect(read('./WordLaneCat.jsx')).toContain('look.lineEnd(); look.release() }')
    expect(read('./WordLaneCat.jsx')).not.toMatch(/freeze\(\)[^\n]*look\.talking\(false\)/)
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
    expect(read('./wordLaneDictorRun.js')).toContain("look()?.word(), left(pc.at)") // пилюли диктора (ход ступени вынесен из директора)
    expect(read('./wordLaneDictorRun.js')).toContain('look()?.lineStart()')
    expect(flow).toContain('scheduleDictor(')
    expect(flow).toContain('look()?.lineStart()')
    expect(flow).toContain('look()?.lineEnd()')
  })
})
