import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

// Страж плавного ухода панели задания («Готово»): во время анимации — только transform/opacity, тяжёлое — после неё
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const cover = read('./SceneTaskCover.jsx')
const task = read('./useSceneTask.js')
const catchCss = read('../../../styles/feed-catch.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('уход панели: анимируется только transform / opacity', () => {
  it('.catchCover едет одним transform; will-change — только пока едет (.catchCoverMoving)', () => {
    const base = catchCss.match(/\n\.catchCover \{([^}]*)\}/)[1]
    expect(base).toMatch(/transition:\s*transform 260ms/)
    expect(catchCss.match(/will-change:[^;]+;/g)).toHaveLength(2) // .catchCoverMoving + reduced-motion (auto)
    expect(catchCss).toMatch(/\.catchCoverMoving \{ will-change: transform; \}/)
  })
})

describe('уход панели: слайд и сцена трогаются ПОСЛЕ анимации', () => {
  it('--catch-cover-h / data-scene-task снимаются только при размонтировании (после transitionend), не в начале ухода', () => {
    const shownEffect = cover.slice(cover.indexOf('}, [shown])') - 700, cover.indexOf('}, [shown])'))
    expect(shownEffect).toContain('return () => ro.disconnect()')
    expect(shownEffect).not.toMatch(/removeAttribute|--catch-cover-h', '0px/)
    const unmount = cover.slice(cover.indexOf('}, [shown])'))
    expect(unmount).toMatch(/return \(\) => \{[\s\S]*removeAttribute\('data-scene-task'\)[\s\S]*\}, \[\]\)/)
  })
  it('сцена возобновляется после размонтирования панели (mounted=false), кадром позже; не раньше transitionend', () => {
    const i = task.indexOf('const wasMounted = useRef(false)')
    const block = task.slice(i, i + 600)
    expect(block).toMatch(/if \(mounted \|\| !was\) return undefined/)
    expect(block).toContain('requestAnimationFrame(() => apiRef?.current?.play?.())')
    expect(block).toContain('cancelAnimationFrame(id)')
    expect(cover).toMatch(/if \(!open\) onClosed\?\.\(\)/) // размонтирование — по transitionend transform
  })
})
