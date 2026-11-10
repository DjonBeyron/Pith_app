import { describe, it, expect } from 'vitest'
import { emptyHist, histStep, clearHist, pastRows, rowMark, HIST_KEEP } from './pillStandHistory.js'
import { emptyEar, earStep } from './pillStandEar.js'
import { renderToStaticMarkup } from 'react-dom/server'
import PillStandHistory from './PillStandHistory.jsx'

// История прошлых целей под пилюлей (замечание владельца: «сказанное слово затирается» — панель сбрасывалась новой целью, при «авто» не успеть увидеть). Строка цели закрывается тем, что панель знала ДО новой цели.
const feed = (h, ear, evs) => { for (const e of evs) { histStep(h, e, ear); earStep(ear, e) } }
const target = (t, n, say) => ({ t, k: 'target', n, say, mode: 'word', lang: 'en', gen: 0 })

describe('история целей стенда', () => {
  it('«авто»: последний черновик / итог прошлой цели и её исход попадают в её строку до новой цели; новая сверху; ничего не стирается само', () => {
    const h = emptyHist(), ear = emptyEar()
    feed(h, ear, [
      target(0, 3, 'wonderful'), { t: 300, k: 'level', rms: 0.2 }, { t: 320, k: 'vosk-partial', raw: { partial: 'wonderful' } }, { t: 700, k: 'level', rms: 0.2 }, { t: 1000, k: 'level', rms: 0.001 },
      { t: 1020, k: 'vosk-final', raw: { text: 'wonderful', result: [] } }, { t: 1030, k: 'word', index: 0, text: 'wonderful' }, { t: 1040, k: 'result', ok: true, afterVoiceMs: 320 },
      target(2240, 4, 'interesting'), { t: 2600, k: 'vosk-partial', raw: { partial: 'inter' } },
    ])
    const rows = pastRows(h)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ n: 3, say: 'wonderful', final: 'wonderful', ok: true, ms: 320 })
    expect([...rows[0].state.counted]).toEqual(['wonderful'])
    expect(h.list.at(-1)).toMatchObject({ n: 4, partial: 'inter', ok: null })
    const html = renderToStaticMarkup(<PillStandHistory hist={h} onClear={() => {}} />)
    expect(html).toContain('#4 wonderful → Vosk: «')
    expect(html).toContain('✓')
    expect(html).toContain('320 мс')
  })
  it('держит HIST_KEEP прошлых + текущую; повтор той же цели (StrictMode) — одна строка; «очистить» оставляет текущую', () => {
    const h = emptyHist()
    for (let i = 0; i < 9; i++) { histStep(h, target(i * 1000, i, `w${i}`)); histStep(h, target(i * 1000 + 1, i, `w${i}`)) }
    expect(h.list).toHaveLength(HIST_KEEP + 1)
    expect(pastRows(h).map(r => r.n)).toEqual([7, 6, 5, 4, 3])
    expect(rowMark(pastRows(h)[0])).toBe('—')
    clearHist(h)
    expect(pastRows(h)).toEqual([]); expect(h.list.at(-1).n).toBe(8)
  })
})
