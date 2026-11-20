import { describe, it, expect } from 'vitest'
import { scorePhrases } from './racePhraseScore.js'
import { rig, P, flush, end } from './racePhraseListenRig.js'

// Журнал владельца v3.3.301, проход 2 «Скажи подряд»: услышано «nice you meet to» — все слова фразы, но не по порядку — засчиталось на 100 %, заливка дошла до края. Теперь порядок важен в обоих проходах.
describe('проход 2: слова фразы только по порядку', () => {
  it('«nice you meet to» — не фраза «nice to meet you» (доля 0,5, не зачёт)', () => {
    expect(scorePhrases([P.meet], 'nice you meet to', true)[0].ratio).toBe(0.5)
  })
  it('слушатель прохода 2: перестановка слов фразу не засчитывает, правильный порядок — засчитывает', async () => {
    const bad = rig([P.meet]); await flush(); await end(bad, 'nice you meet to', 2000)
    expect(bad.got).toEqual([]); expect(bad.words.filter(w => !w.draft).map(w => w.index)).not.toContain(3)
    const ok = rig([P.meet]); await flush(); await end(ok, 'nice to meet you', 2000)
    expect(ok.got).toEqual([expect.objectContaining({ phraseKey: 'nice to meet you', ratio: 1 })])
  })
  it('сказал сначала не то, потом всю фразу в одном заходе — по порядку находится целиком', () => {
    expect(scorePhrases([P.from], 'where you from where are you from', true)[0].ratio).toBe(1)
    expect(scorePhrases([P.from], 'where you from where are', true)[0].ratio).toBe(0.75)
  })
})
