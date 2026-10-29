import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Усы Пита (scene-v2-pit.css): «любое движение плавно начинается и плавно кончается». Тест держит схему в CSS: амплитуда — зарегистрированная переменная с переходом у самих усов,
// анимация применена и при речи, и в хвосте после неё, а ни пауза, ни успокоение сцены не обрывают её мгновенно (animation: none у усов — это и был рывок «усы втыкаются»)
const css = readFileSync(fileURLToPath(new URL('./scene-v2-pit.css', import.meta.url)), 'utf8')
const rule = sel => { const i = css.indexOf(sel + ' {'); return i < 0 ? null : css.slice(i, css.indexOf('}', i) + 1) }
const keyframes = name => { const i = css.indexOf(`@keyframes ${name}`); return css.slice(i, css.indexOf('\n}', i) + 2) }

describe('scene-v2-pit.css — плавный вход и выход усов', () => {
  it('амплитуда --wh-amp зарегистрирована (@property, число) и переходит 0,3 с ease-in-out в одном списке переходов с --talk на корне кота — один лишний переход, а не по одному на ус', () => {
    expect(css).toMatch(/@property --wh-amp \{[^}]*syntax: '<number>'[^}]*initial-value: 0/)
    expect(rule('.scn--v2 .scn-cat')).toContain('transition: --talk 0.3s ease-in-out, --wh-amp 0.3s ease-in-out')
    expect(rule('.scn--v2 .wh')).not.toContain('transition')
  })

  it('угол в keyframes — размах × --wh-amp: при 0 ус стоит ровно в покое, где бы ни снялась анимация', () => {
    for (const name of ['scnWhiskL', 'scnWhiskR']) {
      const k = keyframes(name)
      expect(k.match(/rotate: calc\(-?\d+deg \* var\(--wh-amp\)\)/g)).toHaveLength(2) // 0 % и 100 % — одна строка, 50 % — вторая
      expect(k).not.toMatch(/rotate: -?\d+deg/) // ни одного фиксированного угла: иначе конец анимации был бы рывком
    }
  })

  it('анимация усов применена при is-talking И при is-tail (хвост после речи), только в live и не на lite; lite/reduced — без неё', () => {
    for (const sel of ['.wh-l', '.wh-r']) expect(css).toContain(`.scn--v2.scn--live:not(.scn--lite) .scn-cat:is(.is-talking, .is-tail) ${sel} { animation: scnWhisk`)
    expect(css).toContain('.scn-cat:is(.is-talking, .is-tail) .wh-d { animation-duration: 0.72s; animation-delay: -0.25s; }')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^@]*\.scn--v2 \.wh \{ animation: none; \}/)
  })

  it('речь = амплитуда 1; пауза и успокоение гасят амплитуду переходом, а не снимают анимацию (animation: none у .wh нет нигде, кроме reduced-motion)', () => {
    expect(rule('.scn--v2 .scn-cat.is-talking')).toContain('--wh-amp: 1')
    const quiet = css.split('\n').find(l => l.includes('.scn--v2.scn--paused .scn-cat.is-talking'))
    expect(quiet).not.toContain('data-scrolling') // прокрутка ленты только паузит анимацию (дёшево), переходы на скролле не гоняем
    expect(css).toContain('[data-scrolling="1"] .scn--v2 .wh { animation-play-state: paused; }')
    expect(quiet).toContain('.scn--v2.scn--settle .scn-cat.is-talking')
    expect(quiet).toContain('--wh-amp: 0')
    expect(css).not.toMatch(/\.scn--settle \.wh\s*\{[^}]*animation:\s*none/)
    const none = [...css.matchAll(/[^\n}]*\.wh[^{\n]*\{[^}]*animation:\s*none[^}]*\}/g)].map(m => m[0])
    expect(none).toHaveLength(1) // только reduced-motion
    expect(none[0]).toContain('.scn--v2 .wh')
  })

  it('--talk (кивок головы и хвост) усы больше не читают: пауза усов не меняет их поведение', () => {
    expect(keyframes('scnWhiskL') + keyframes('scnWhiskR')).not.toContain('--talk')
  })

  it('зрачки: переходы мягкие (ease-in-out), без щелчка', () => {
    expect(css).toMatch(/transition: translate 180ms ease-in-out, scale 350ms ease-in-out/)
  })
})
