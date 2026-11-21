import { describe, it, expect } from 'vitest'
import { rig, flush, end } from './racePhraseListenRig.js'
import { unglue } from './racePhraseGlue.js'

// Склейка в итоге Vosk (racePhraseGlue.js): короткий кусок слова цели вплотную к «[unk]» — часть чужого слова.
describe('журнал 13:31 (v3.3.323), «I\'m trying to learn»: «что он тут определил, чтобы trying определить» — итог «trying [unk]», слово 0,31 с вплотную к «[unk]»', () => {
  const LEARN = { key: 'learn', words: ["i'm", 'trying', 'to', 'learn'] }
  const W = (word, start, end) => ({ word, start, end, conf: 1 })
  it('unglue: короткий кусок вплотную к «[unk]» — чужое слово; настоящее слово с паузой перед чужим — остаётся (времена из журналов)', () => {
    expect(unglue('trying [unk]', [W('trying', 0.3, 0.610144), W('[unk]', 0.755072, 1.2)])).toBe('[unk] [unk]')
    expect(unglue('from [unk]', [W('from', 0.5, 0.64), W('[unk]', 0.64, 1.94)])).toBe('[unk] [unk]')
    expect(unglue('[unk] you [unk]', [W('[unk]', 1.02, 2.07), W('you', 2.16, 2.4), W('[unk]', 4.757, 5.04)])).toBe('[unk] [unk] [unk]')
    expect(unglue('where [unk]', [W('where', 0.69, 1.14), W('[unk]', 1.5, 1.86)])).toBe('where [unk]') // «where», пауза 0,36 с, чужое слово
    expect(unglue('are [unk]', [W('are', 0.57, 0.99), W('[unk]', 1.5, 1.92)])).toBe('are [unk]')
    expect(unglue('where [unk] you from', [W('where', 0.1, 0.55), W('[unk]', 0.55, 0.9), W('you', 0.9, 1.3), W('from', 1.3, 1.8)])).toBe('where [unk] you from') // слитно, слово полной длины — правило 4 владельца цело
    expect(unglue('trying [unk]', [])).toBe('trying [unk]'); expect(unglue('trying', [W('trying', 0.3, 0.61)])).toBe('trying')
  })
  it('слушатель: «i\'m» подтверждено; итог «trying [unk]» с временами склейки — «trying» не засчитано, неверное слово; честный итог «trying» — засчитано', async () => {
    const r = rig([LEARN], { wordByWord: true, holdFirst: true }); await flush()
    r.cur().cb.onPartial("i'm"); r.advance(400); await end(r, "i'm", 10)
    for (const v of [0.002, 0.05, 0.06, 0.002]) r.cur().cb.onLevel(v)
    r.cur().cb.onPartial('trying'); r.cur().cb.onResult('trying [unk]', { words: [W('trying', 0.3, 0.610144), W('[unk]', 0.755072, 1.2)] }); r.advance(10); await flush()
    expect(r.words.some(w => w.index === 1)).toBe(false); expect(r.hears.some(h => h.kind === 'wrong')).toBe(true)
    expect(r.logs.some(l => l.includes('кусок чужого слова'))).toBe(true)
    r.cur().cb.onPartial('trying'); r.cur().cb.onResult('trying', { words: [W('trying', 0.69, 1.38)] })
    expect(r.words.filter(w => !w.draft).map(w => w.index)).toEqual([0, 1])
    r.l.stop()
  })
})
