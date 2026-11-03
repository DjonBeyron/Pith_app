import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { builtLanes, nextLabels, nextFrames, clearFrames, initFrames, EMPTY_MEM, blankLabels, FRAME_MS, FRAME_LITE_MS } from './wordLaneLabels.js'
import { labelsFor } from './wordLaneStages.js'
import WordLaneHeads from './WordLaneHeads.jsx'
import { buildRehearsalStages } from '../../../rehearsal/rehearsalStages.js'
import { fixturePlan, FIXTURE_IDS } from '../../../rehearsal/rehearsalFixtures.js'

// Подписи сверху (v3.3.101): в «Сборке с конца» накапливаются и не пересоздаются; у новой подписи — рамка (data-new), у прежних — нет
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const texts = labels => labels.map(l => l.text)

// Прогон хука useBuiltLabels без React: память акта передаётся от стадии к стадии, как это делает useState
function walk(stages, chunks, { quietAt = () => false } = {}) {
  let mem = EMPTY_MEM
  return stages.map((st, i) => {
    const shown = st.type === 'announce' ? stages[i + 1] : st
    const quiet = quietAt(st, i)
    const base = labelsFor(quiet ? null : shown, chunks, [], [])
    const r = nextLabels(mem, { base, act: shown?.act ?? null, reached: builtLanes(stages, shown) })
    mem = r.mem
    return { st, labels: r.labels }
  })
}

describe('builtLanes: какие дорожки уже звучали в акте', () => {
  const stages = [{ idx: 0, act: 'a', type: 'announce' }, { idx: 1, act: 'a', step: { active: [2] } }, { idx: 2, act: 'a', step: { active: [1, 2] } }, { idx: 3, act: 'b', step: { active: [0] } }]
  it('объединение дорожек стадий акта от начала до этой стадии; другой акт не в счёт', () => {
    expect(builtLanes(stages, stages[1])).toEqual([2])
    expect(builtLanes(stages, stages[2])).toEqual([1, 2])
    expect(builtLanes(stages, stages[3])).toEqual([0])
    expect(builtLanes(stages, null)).toEqual([])
  })
})

describe('«Сборка с конца»: подписи накапливаются', () => {
  for (const id of FIXTURE_IDS) {
    const plan = fixturePlan(id)
    const { stages } = buildRehearsalStages({ plan })
    const build = stages.filter(s => s.act === 'build')
    if (plan.chunks.length < 3 || !build.length) continue
    it(`фикстура ${id}: ступени [2] → [1,2] → [0,1,2] — к подписям добавляется ровно одна новая, прежние остаются на месте на всех стадиях`, () => {
      const rows = walk(stages, plan.chunks).filter(r => r.st.act === 'build')
      let shown = []
      for (const { labels } of rows) {
        const now = labels.map((l, k) => (l.text ? k : -1)).filter(k => k >= 0)
        for (const k of shown) expect(now, 'показанная подпись не пропадает').toContain(k)
        expect(now.length - shown.length, 'за стадию добавляется не больше одной подписи').toBeLessThanOrEqual(1)
        shown = now
      }
      expect(shown).toEqual([0, 1, 2])
      const firstTexts = rows.find(r => r.st.type === 'dictor').labels
      expect(firstTexts.filter(l => l.text)).toHaveLength(1) // первая ступень — одна подпись (последний кусок), а не все три сразу
    })
    it(`фикстура ${id}: пока Пит говорит реплику стадии (тихий экран), уже показанные подписи остаются`, () => {
      const rows = walk(stages, plan.chunks, { quietAt: st => st.act === 'build' && st.type === 'announce' && st.sid !== 'build-ann' })
      const quiet = rows.filter(r => r.st.act === 'build' && r.st.type === 'announce' && r.st.sid !== 'build-ann')
      expect(quiet.length).toBeGreaterThan(0)
      for (const q of quiet) expect(q.labels.filter(l => l.text)).toHaveLength(3)
    })
  }
  it('начало акта в тишине (Пит говорит реплику акта): подписей ещё нет — как и раньше, экран пустой', () => {
    const plan = fixturePlan('three')
    const { stages } = buildRehearsalStages({ plan })
    const first = stages.findIndex(s => s.act === 'build')
    const rows = walk(stages, plan.chunks, { quietAt: (st, i) => i === first })
    expect(texts(rows[first].labels)).toEqual(['', '', ''])
  })
  it('другие акты — подписи как есть (разминка: перевод слова; память сборки сброшена)', () => {
    const plan = fixturePlan('three')
    const { stages } = buildRehearsalStages({ plan })
    const rows = walk(stages, plan.chunks)
    const warm = rows.find(r => r.st.type === 'warmup')
    expect(warm.labels).toEqual(labelsFor(warm.st, plan.chunks, [], []))
    const read1 = rows.find(r => r.st.act === 'read' && r.st.type === 'read')
    if (read1) expect(read1.labels).toEqual(labelsFor(read1.st, plan.chunks, [], []))
  })
  it('память: тот же объект, пока ничего не изменилось (хук не пересоздаёт состояние на каждом рендере)', () => {
    const base = [{ text: '', on: false }, { text: '', on: false }, { text: 'c', on: true }]
    const a = nextLabels(EMPTY_MEM, { base, act: 'build', reached: [2] })
    const b = nextLabels(a.mem, { base, act: 'build', reached: [2] })
    expect(b.mem).toBe(a.mem)
    expect(nextLabels(EMPTY_MEM, { base: blankLabels(), act: 'read', reached: [] }).mem).toBe(EMPTY_MEM)
  })
})

describe('nextFrames: рамка только у новой подписи', () => {
  const heads = (...t) => t.map(text => ({ text, on: true }))
  it('появилась подпись на одной дорожке — рамка только у неё; прежние без рамки', () => {
    let st = initFrames(heads('', '', 'c'))
    st = nextFrames(st, heads('', 'b', 'c'))
    expect(st.nw).toEqual([0, 1, 0])
    st = nextFrames(st, heads('a', 'b', 'c'))
    expect(st.nw[0]).toBe(1); expect(st.nw[2]).toBe(0)
  })
  it('первый кадр без рамок (подписи, которые уже были при монтировании, — не новые); тот же текст — тот же объект', () => {
    const st = initFrames(heads('a', 'b', 'c'))
    expect(st.nw).toEqual([0, 0, 0])
    expect(nextFrames(st, heads('a', 'b', 'c'))).toBe(st)
  })
  it('текст сменился на той же дорожке — рамка заново (1 ↔ 2, анимация перезапускается); текст исчез — рамка снята сразу', () => {
    let st = nextFrames(initFrames(heads('', '', '')), heads('x', '', ''))
    expect(st.nw[0]).toBe(1)
    st = nextFrames(st, heads('y', '', ''))
    expect(st.nw[0]).toBe(2)
    st = nextFrames(st, heads('z', '', ''))
    expect(st.nw[0]).toBe(1)
    st = nextFrames(st, heads('', '', ''))
    expect(st.nw[0]).toBe(0)
  })
  it('время вышло — рамки снимаются; чужое событие ничего не трогает', () => {
    let st = nextFrames(initFrames(heads('', '', '')), heads('x', '', ''))
    const later = nextFrames(st, heads('x', 'y', ''))
    expect(later.nw).toEqual([1, 1, 0])
    expect(clearFrames(later, later.seq).nw).toEqual([0, 0, 0])
    expect(clearFrames(st, st.seq).nw).toEqual([0, 0, 0])
    expect(clearFrames(clearFrames(st, st.seq), st.seq)).toEqual(clearFrames(st, st.seq))
  })
  it('время рамки: 1,3 с (анимация 1,2 с), на слабом устройстве 1 с', () => {
    expect(FRAME_MS).toBeGreaterThanOrEqual(1200); expect(FRAME_MS).toBeLessThanOrEqual(1500)
    expect(FRAME_LITE_MS).toBe(1000)
  })
})

describe('WordLaneHeads: разметка', () => {
  const markup = (heads, fresh) => renderToStaticMarkup(createElement(WordLaneHeads, { heads, fresh }))
  const heads = [{ text: 'I\'m', on: false }, { text: 'trying', on: true }, { text: 'to learn', on: true }]
  it('data-new только у подписи с рамкой (значение 1 или 2), у прежних атрибута нет', () => {
    const html = markup(heads, [0, 0, 2])
    expect(html.match(/data-new/g)).toHaveLength(1)
    expect(html).toMatch(/data-testid="wl-head-2" data-new="2"/)
    expect(html).not.toMatch(/data-testid="wl-head-0"[^>]*data-new/)
    expect(markup(heads, [0, 0, 0])).not.toContain('data-new')
  })
  it('три узла с ключами-номерами: между стадиями React не пересоздаёт подписи', () => {
    expect(read('./WordLaneHeads.jsx')).toContain('key={i}')
  })
})

describe('подключение и стили', () => {
  it('директор берёт подписи с памятью акта; игра считает рамку по тому, что показано, и не трогает читку-караоке', () => {
    expect(read('./useWordLaneFlow.js')).toContain('useBuiltLabels({ stages, stage:')
    const game = read('./WordLaneGame.jsx')
    expect(game).toContain('useLabelFrames(heads, lite)')
    expect(game).toContain('<WordLaneHeads heads={heads} fresh={fresh} />')
    expect(game).toContain('data-lite={lite || undefined}')
    expect(read('../../../rehearsal/read/ReadKaraoke.jsx')).not.toContain('data-new')
  })
  const css = readFileSync(new URL('../../../../styles/player/modules/word-lane-label-frame.css', import.meta.url), 'utf8')
  it('рамка — анимация opacity на ::before по data-new, без filter; цвет дорожки; слабое устройство и reduced-motion — без анимации', () => {
    expect(css).toMatch(/\.wlHead\[data-new\]::before \{[^}]*border: 2px solid rgba\(var\(--rgb\)/)
    expect(css).toMatch(/\.wlHead\[data-new='1'\]::before \{ animation: wlHeadFrameA 1\.2s/)
    expect(css).toMatch(/\.wlHead\[data-new='2'\]::before \{ animation: wlHeadFrameB 1\.2s/)
    expect(css).toMatch(/\.wlHeads\[data-lite\] \.wlHead\[data-new\]::before \{ animation: none; opacity: 1; \}/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.wlHead\[data-new\]::before \{ animation: none/)
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/filter/)
    expect(css).toContain('--lvl1-rgb'); expect(css).toContain('--lvl3-rgb')
  })
  it('файл стилей подключён в index.css', () => {
    expect(readFileSync(new URL('../../../../index.css', import.meta.url), 'utf8')).toContain("@import './styles/player/modules/word-lane-label-frame.css';")
  })
})
