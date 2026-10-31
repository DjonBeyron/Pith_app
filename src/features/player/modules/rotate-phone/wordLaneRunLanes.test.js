import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runLanes, RUN_NONE, RUN_ALL } from './wordLaneRunLanes.js'
import { SPEED } from './wordLaneTimeline.js'
import WordLanePills from './WordLanePills.jsx'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))

// Конвейер на дорожке (v3.3.84): штрихи бегут по дорожкам, на которых едут пилюли; гаснут, когда дорожка стоит
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const html = run => renderToStaticMarkup(createElement(WordLanePills, { scene: { kind: 'idle' }, levels: null, fx: {}, live: { seq: [], misses: 0 }, sceneApi: { current: null }, visible: true, ...(run ? { run } : {}) }))

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
  it('data-run ставится только колонкам, которые идут; по умолчанию ни одной; узлов не прибавляется (три колонки как были)', () => {
    expect(html()).not.toContain('data-run')
    const on = html('101')
    expect(on.match(/<i data-run="1"><\/i>/g)).toHaveLength(2)
    expect(on).toContain('<i data-run="1"></i><i></i><i data-run="1"></i>')
    expect(html('111').match(/data-run="1"/g)).toHaveLength(3)
  })
  it('игра считает run из стадии: runLanes(f.stageObj) передаётся в WordLanePills', () => {
    expect(read('./WordLaneGame.jsx')).toContain('run={runLanes(f.stageObj)}')
  })
  const css = read('../../../../styles/player/modules/word-lane-lane-run.css')
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  it('один слой ::before колонки; едет transform за период со скоростью пилюль: период 8 dvh / SPEED % в секунду', () => {
    const period = 8
    const sec = Number(code.match(/animation: wlLaneRun ([\d.]+)s linear infinite/)[1])
    expect(sec).toBeCloseTo(period / SPEED, 2)
    expect(code).toMatch(/--run-p: 8dvh;/)
    expect(code).toMatch(/@keyframes wlLaneRun \{ to \{ transform: translateY\(8dvh\); \} \}/)
    expect(code).toMatch(/top: calc\(var\(--run-p\) \* -1\);/)
    expect(code).not.toMatch(/filter|background-position|:after/)
  })
  it('штрихи видны только у колонки с data-run, появляются и гаснут плавно (opacity-переход)', () => {
    expect(code).toMatch(/\.wlLanes i::before \{[^}]*opacity: 0;[^}]*transition: opacity 0\.4s/)
    expect(code).toMatch(/\.wlLanes i\[data-run\]::before \{ opacity: 1;/)
  })
  it('слабое устройство (wl--lite, weak-device) и reduced-motion: штрихи статичны, без анимации и слоя', () => {
    expect(code).toMatch(/\.wl--lite \.wlLanes i\[data-run\]::before, \.weak-device \.wlLanes i\[data-run\]::before \{ animation: none; will-change: auto; \}/)
    expect(code.slice(code.indexOf('@media (prefers-reduced-motion'))).toMatch(/animation: none/)
  })
  it('файл подключён в index.css, ≤ 250 строк', () => {
    expect(read('../../../../index.css')).toContain("@import './styles/player/modules/word-lane-lane-run.css'")
    expect(css.split('\n').length).toBeLessThanOrEqual(250)
  })
})
