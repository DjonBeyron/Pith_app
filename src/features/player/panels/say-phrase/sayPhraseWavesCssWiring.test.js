import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CIRCLE_R, RING_R0, RING_K, WAVE_MARGIN } from '../../../../shared/lib/speech/sayRings.js'

// Волны круга «Сказать фразу» (пункты 5–7): циклические волны, старт ВСЕХ волн от внешней обводки круга, размеры ×0,85 и потолок амплитуды
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = c => c.replace(/\/\*[\s\S]*?\*\//g, '')
const waves = strip(read('../../../../styles/player/panels/say-phrase-waves.css'))
const ring = strip(read('../../../../styles/player/panels/say-phrase-ring.css'))
const state = strip(read('../../../../styles/player/panels/say-phrase-state.css'))
const mic = strip(read('../../../../styles/player/panels/say-phrase-mic.css'))
const stage = read('./SayStage.jsx')
const rules = (c, re) => [...c.matchAll(new RegExp(re.source, 'g'))].map(m => m[0])
const num = (s, re) => Number(s.match(re)[1])
const PANEL_HALF = 114.5 // клип 229px: центр круга в 114px от верха

describe('say_phrase — циклические волны (п.5)', () => {
  it('три мягких кольца, бесконечно, период 1,8–2,4 с со сдвигом фазы (период / 3), прозрачность убывает к нулю, радиус ограничен, только transform/opacity', () => {
    const rule = waves.match(/\.sayWaveClip--cyc \.sayCycWaves i \{ animation: sayCycWave ([\d.]+)s linear ([\d.]+)s infinite backwards;/)
    const period = Number(rule[1])
    expect(period).toBeGreaterThanOrEqual(1.8)
    expect(period).toBeLessThanOrEqual(2.4)
    const d1 = Number(rule[2])
    const d2 = num(waves, /i:nth-child\(2\) \{ animation-delay: ([\d.]+)s; \}\s*\n\.sayWaveClip--cyc \.sayCycWaves i:nth-child\(3\)/)
    const d3 = num(waves, /\.sayCycWaves i:nth-child\(3\) \{ animation-delay: ([\d.]+)s; \}/)
    expect(d2 - d1).toBeCloseTo(period / 3, 1)
    expect(d3 - d2).toBeCloseTo(period / 3, 1)
    expect(d1).toBeGreaterThanOrEqual(0.5)                            // первая волна — после всплеска активации
    expect((stage.match(/<span className="sayCycWaves"[^>]*>(<i \/>){3}<\/span>/g) ?? []).length).toBe(1)
    const kf = waves.match(/@keyframes sayCycWave \{([\s\S]*?)\n\}/)[1]
    const end = num(kf, /100%\s*\{\s*transform: scale\(([\d.]+)\);\s*opacity: 0;/)
    expect(end * RING_R0).toBeLessThanOrEqual(PANEL_HALF - WAVE_MARGIN) // радиус ограничен контейнером
    expect(end).toBeGreaterThan(1.2)
    const peak = num(kf, /10%\s*\{\s*opacity: ([\d.]+);/)
    expect(peak).toBeLessThan(0.55)                                   // слабее эквалайзера (прозрачность его ближнего кольца при уровне 1 — .55)
    expect(peak).toBeGreaterThan(0.2)
    expect(num(kf, /50%\s*\{\s*opacity: ([\d.]+);/)).toBeLessThan(peak) // убывает по мере расхождения
    expect(kf).toMatch(/0%\s*\{\s*transform: scale\(1\);\s*opacity: 0;/) // выходит из-под обводки, начинает с её края
    expect([...kf.matchAll(/([\w-]+)\s*:/g)].every(m => ['transform', 'opacity'].includes(m[1]))).toBe(true)
  })

  it('включаются только в записи и плавно гаснут: слой проявляется в --live, цикл крутится при --cyc (запись + хвост useLingerFlag), GPU-слой только на время цикла; reduced-motion — отключены', () => {
    expect(waves).toMatch(/\.sayCycWaves \{ opacity: 0; transition: opacity \.4s; \}/)
    expect(waves).toMatch(/\.sayWaveClip--live \.sayCycWaves \{ opacity: 1; \}/)
    expect(waves).toMatch(/animation: sayCycWave[^;]*; will-change: transform, opacity;/)
    expect(rules(waves, /\n\.sayCycWaves i \{[^}]*\}/).join('')).not.toMatch(/will-change|animation/) // в покое анимации и слоя нет
    expect(waves.slice(waves.indexOf('prefers-reduced-motion'))).toMatch(/\.sayCycWaves \{ display: none; \}/)
    expect(stage).toContain('const cyc = useLingerFlag(live, CYC_TAIL_MS)')
    expect(stage).toContain("cyc ? ' sayWaveClip--cyc' : ''")
    expect(Number(stage.match(/CYC_TAIL_MS = (\d+)/)[1])).toBeGreaterThanOrEqual(400) // не короче затухания слоя .4s
    expect(readdirSync(dir)).toContain('useLingerFlag.js')
  })
})

describe('say_phrase — волны стартуют от внешней обводки (п.7)', () => {
  it('якорь волн = внешний край обводки в покое (106,25 px = 2 × (51 + 2,125)) и растёт ×1,15 по той же кривой, что обводка; в записи края совпадают с RING_R0', () => {
    const anchor = waves.match(/\.sayWaveAnchor \{[^}]*\}/)[0]
    const d = num(anchor, /width: ([\d.]+)px/)
    const svgPx = num(ring, /\.sayRing \{[^}]*width: ([\d.]+)px/)       // 108,8
    const rr = svgPx * 60 / 128, half = svgPx / 128 * 5 / 2             // r = 60 и stroke 5 в viewBox 128
    expect(d / 2).toBeCloseTo(rr + half, 2)
    expect(d / 2 * 1.15).toBeCloseTo(RING_R0, 1)
    expect(anchor).toMatch(/transform: scale\(var\(--wave-scale\)\);\s*transition: transform var\(--size-t\)/)
    expect(waves).toMatch(/\.sayWaveClip--live \{ --wave-scale: 1\.15; --size-t: var\(--size-in\); \}/)
    expect(state).toMatch(/\.sayMicBox--active \{[^}]*--ring-scale: 1\.15;[^}]*--size-t: var\(--size-in\)/) // и обводка — 1,15 по той же --size-in
    expect(RING_R0 - CIRCLE_R).toBeGreaterThan(10)                       // между кругом и обводкой зазор — волн в нём нет
  })

  it('кольца волн — только обводка без заливки (ничего не просвечивает между кругом и обводкой), лежат под обводкой и кругом, масштаб ≥ 1', () => {
    for (const r of rules(waves, /\.sayActWaves i, \.sayEq i, \.sayCycWaves i \{[^}]*\}/)) expect(r).not.toMatch(/background/)
    expect(waves).not.toMatch(/rgba\(182, 254, 59, 0?\.1\)/)
    const act = waves.match(/@keyframes sayActWave \{([\s\S]*?)\n\}/)[1]
    expect(act).toMatch(/0%\s*\{\s*transform: scale\(1\);\s*opacity: 0;/)
    expect(Number(act.match(/100%\s*\{\s*transform: scale\(([\d.]+)\)/)[1]) * RING_R0).toBeLessThanOrEqual(PANEL_HALF - WAVE_MARGIN)
    const jsx = stage.replace(/\/\/.*$/gm, '')
    expect(jsx.indexOf('sayWaveClip')).toBeLessThan(jsx.indexOf('<SayRing />')) // слой волн под обводкой (SayRing) и кнопкой
    expect(read('./useSayWaves.js')).not.toMatch(/scale\((0|[^)]*-)/)
  })

  it('потолок амплитуды: все волны (эквалайзер, активация, циклические) укладываются в половину высоты клипа с запасом', () => {
    const act = num(waves.match(/@keyframes sayActWave[\s\S]*?\n\}/)[0], /100%\s*\{\s*transform: scale\(([\d.]+)\)/)
    const cyc = num(waves.match(/@keyframes sayCycWave[\s\S]*?\n\}/)[0], /100%\s*\{\s*transform: scale\(([\d.]+)\)/)
    const eq = 1 + Math.max(...RING_K)
    for (const k of [act, cyc, eq]) expect(k * RING_R0).toBeLessThanOrEqual(PANEL_HALF - WAVE_MARGIN)
    expect(Math.max(act, cyc, eq) * RING_R0).toBeLessThanOrEqual(96) // на 320 px по бокам запас (160 − …) больше 100 px
  })
})

describe('say_phrase — размеры ×0,85 (п.6)', () => {
  it('круг 85, кольцо 108,8 (зазор ≈ 6,8 px, толщина 4,25), иконка 39, ободок 1,7, «Готово» 13,6; множители состояний прежние (0,85 / 1 / 1,15)', () => {
    expect(num(mic, /\.sayPanel \.sayMicBtn \{[^}]*width: ([\d.]+)px/)).toBe(100 * 0.85)
    expect(num(ring, /\.sayRing \{[^}]*width: ([\d.]+)px/)).toBeCloseTo(128 * 0.85, 6)
    expect(mic).toMatch(/border: 1\.7px solid var\(--mic-rim\)/)
    expect(read('./SayMicIcon.jsx')).toContain('size = 39')
    expect(num(mic, /\.sayFaceDone \{[^}]*font-size: ([\d.]+)px/)).toBeCloseTo(16 * 0.85, 6)
    expect(read('./SayStage.jsx')).toContain('<Check size={32}')
    const code = state
    expect(code).toMatch(/\.sayMicBox--locked \{\s*--mic-scale: \.85;/)
    expect(code).toMatch(/\.sayMicBox--active \{\s*--mic-scale: 1\.15;/)
    expect(CIRCLE_R).toBeCloseTo(85 * 1.15 / 2, 6)
    const gap = (num(ring, /\.sayRing \{[^}]*width: ([\d.]+)px/) * 60 / 128) - 85 / 2 // центр обводки − радиус круга
    expect(gap).toBeCloseTo(10 * 0.85, 6)
  })
})
