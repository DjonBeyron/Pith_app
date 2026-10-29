import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Усы Пита: «любое движение плавно начинается и плавно кончается». Качает их JS (whiskerDrive.js), а в CSS остаётся только якорь вращения. Тест держит это: в стилях НЕТ того, что в Safari давало рывок
// на старте и в конце — зарегистрированной переменной амплитуды с переходом, var() в keyframes и animation у усов
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const css = read('./scene-v2-pit.css')
const lane = read('../../../styles/player/modules/word-lane.css')
const code = c => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$|\s\/\/ .*$/gm, '') // без комментариев (/* */ и //): в них механизм описан словами

describe('scene-v2-pit.css — усы без CSS-анимации', () => {
  it('нет @property --wh-amp, переходов амплитуды, keyframes scnWhisk* и animation у усов (ни при is-talking, ни при is-tail)', () => {
    const c = code(css)
    expect(c).not.toContain('--wh-amp')
    expect(c).not.toContain('@property')
    expect(c).not.toContain('scnWhisk')
    expect(c).not.toMatch(/\.wh[^{]*\{[^}]*animation/)
    expect(c).not.toContain('is-tail')
    expect(c).not.toMatch(/\.scn-cat\s*\{[^}]*transition/) // переход --talk остаётся в scene-v2-cat.css, pit.css его не трогает
  })

  it('якорь вращения усов на месте: fill-box, у левых правый край, у правых левый (иначе ус вращается вокруг центра)', () => {
    expect(css).toContain('.scn--v2 .wh { transform-box: fill-box; }')
    expect(css).toContain('.scn--v2 .wh-l { transform-origin: 100% 50%; }')
    expect(css).toContain('.scn--v2 .wh-r { transform-origin: 0 50%; }')
  })

  it('reduced-motion: усы отключает сам привод (whiskerDrive.js), а в CSS у остального прежние правила', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^@]*\.scn--v2 \.pu \{ transition: none; \}/)
    expect(read('./whiskerDrive.js')).toContain('prefers-reduced-motion: reduce')
  })

  it('зрачки: переходы мягкие (ease-in-out), без щелчка', () => {
    expect(css).toMatch(/transition: translate 180ms ease-in-out, scale 350ms ease-in-out/)
  })
})

describe('word-lane.css (кот игры) — усы без CSS-анимации', () => {
  it('ни animation, ни перехода --wh-amp, ни is-tail; корень кота по-прежнему не переходит --talk', () => {
    const c = code(lane)
    expect(c).not.toContain('--wh-amp')
    expect(c).not.toContain('is-tail')
    expect(c).not.toMatch(/\.wlCat[^{]*\.wh[^{]*\{/)
    expect(c).toContain('.wlCat.scn--v2 .scn-cat { transition: none; }')
  })
})

describe('привод усов — единый механизм', () => {
  it('whiskerDrive.js не зависит от CSS-переходов и переменных: пишет только style.rotate', () => {
    const src = code(read('./whiskerDrive.js'))
    expect(src).toContain('.style.rotate =')
    expect(src).not.toMatch(/setProperty|--wh-amp|\.animate\(|classList\.(add|remove)/)
  })
})
