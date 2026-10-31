import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runLanes, RUN_NONE, RUN_ALL } from './wordLaneRunLanes.js'
import { PERIOD, REST_A, RUN_A } from './wordLaneConveyor.js'
import WordLanePills from './WordLanePills.jsx'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))

// Конвейер на дорожке: runLanes — дорожки стадии с пилюлями (v3.3.84); разметка и стили пунктира (v3.3.85: одна линия по центру, привод вместо CSS-анимации)
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const html = armed => renderToStaticMarkup(createElement(WordLanePills, { scene: { kind: 'idle' }, levels: null, fx: {}, live: { seq: [], misses: 0 }, sceneApi: { current: null }, visible: true, ...(armed ? { armed } : {}) }))

describe('runLanes: какие дорожки идут на стадии', () => {
  it('диктор и ученик — дорожки ступени (active, иначе parts); «Порядок» и «Различи» — все три', () => {
    expect(runLanes({ type: 'dictor', step: { active: [0, 2], parts: [0, 2] } })).toBe('101')
    expect(runLanes({ type: 'student', step: { active: [1], parts: [1] } })).toBe('010')
    expect(runLanes({ type: 'dictor', step: { parts: [0, 1, 2] } })).toBe(RUN_ALL)
    expect(runLanes({ type: 'order' })).toBe(RUN_ALL)
    expect(runLanes({ type: 'discern' })).toBe(RUN_ALL)
  })
  it('репетиция: разминка и дубль идут как ученик, читка — как диктор', () => {
    expect(runLanes({ type: 'warmup', act: 'warmup', step: { active: [2] } })).toBe('001')
    expect(runLanes({ type: 'take', act: 'take', step: { active: [0, 1, 2] } })).toBe(RUN_ALL)
    expect(runLanes({ type: 'read', act: 'read', step: { active: [0, 1] } })).toBe('110')
  })
  it('плашки, зеркало, итог, заставка и пауза (нет стадии) — дорожки стоят', () => {
    for (const t of ['announce', 'turn', 'mirror', 'summary']) expect(runLanes({ type: t, step: { active: [0, 1, 2] } })).toBe(RUN_NONE)
    expect(runLanes(null)).toBe(RUN_NONE)
    expect(runLanes(undefined)).toBe(RUN_NONE)
  })
})

describe('разметка и CSS конвейера', () => {
  it('в разметке три колонки без атрибутов и без новых узлов: состояние дорожек пишет привод в CSS-переменные', () => {
    for (const armed of [undefined, '101', '111']) {
      const h = html(armed)
      expect(h).not.toContain('data-run')
      expect(h).toContain('<i></i><i></i><i></i>')
    }
  })
  it('WordLanePills запускает привод (useLaneConveyor) с armed и paused, слабое устройство / reduced-motion — still', () => {
    const src = read('./WordLanePills.jsx')
    expect(src).toContain('useLaneConveyor(rootRef, { armed, paused, still })')
    expect(src).toContain('lite || reducedMotion()')
    expect(read('./useLaneConveyor.js')).toContain('createConveyorDrive')
  })
  const css = read('../../../../styles/player/modules/word-lane-lane-run.css')
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  it('один слой ::before колонки: пунктир 1 px по центру дорожки, период из модели (PERIOD dvh), без CSS-анимации и filter', () => {
    expect(code).toContain(`--run-p: ${PERIOD}dvh;`)
    expect(code).toMatch(/left: calc\(50% - 0\.5px\);\s*width: 1px;/)
    expect(code).toMatch(/top: calc\(var\(--run-p\) \* -1\);/)
    expect(code).toMatch(/transform: translate3d\(0, var\(--run-y, 0dvh\), 0\);/)
    expect(code).toMatch(/mask-image: repeating-linear-gradient\(to bottom, #000 0 [\d.]+dvh, transparent [\d.]+dvh var\(--run-p\)\)/)
    expect(code).not.toMatch(/animation|@keyframes|transition|filter|::after|background-position/)
  })
  it('в покое видно всегда, но еле-еле (прозрачность по умолчанию = REST_A); яркость ведёт --run-a, волна «зажигания» — --run-w', () => {
    expect(code).toContain(`var(--run-a, ${REST_A})`)
    expect(code).toMatch(/var\(--run-w, 999dvh\)/)
    expect(code).not.toMatch(/opacity: 0;/)
    expect(RUN_A).toBeGreaterThan(REST_A)
  })
  it('цвет дорожки — --rgb колонки; слабое устройство (wl--lite, weak-device) слой без will-change', () => {
    expect(code).toContain('rgba(var(--rgb),')
    expect(code).toMatch(/\.wl--lite \.wlLanes i::before, \.weak-device \.wlLanes i::before \{ will-change: auto; \}/)
  })
  it('файл подключён в index.css, ≤ 250 строк', () => {
    expect(read('../../../../index.css')).toContain("@import './styles/player/modules/word-lane-lane-run.css'")
    expect(css.split('\n').length).toBeLessThanOrEqual(250)
  })
})
