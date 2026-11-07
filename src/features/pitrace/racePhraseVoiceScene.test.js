import { describe, it, expect } from 'vitest'
import { createPhraseVoice } from './racePhraseVoice.js'
import { normalizePhrase, phrasesOf } from './racePhraseData.js'
import { transTexts, sprintTransTexts } from './raceTrans.js'

// Круг 1 «Пойми» — Пит говорит ситуацию (scene), круг 2 «Скажи» — смысл (ru); scene пустой — круг 1 говорит ru
const nice = normalizePhrase({ text: 'Nice to meet you', ru: 'скажи, что рад знакомству', scene: 'ты знакомишься с новым человеком' })
const bare = normalizePhrase({ text: 'See you later', ru: 'попрощайся до скорого' })

function make(voiced = () => true) {
  const said = [], shown = [], logs = [], timers = []
  const v = createPhraseVoice({ ctx: () => ({ sayText: (t, o) => said.push(`${o?.ru ? 'ru' : 'en'}:${t}`), sayLine() {}, cat: { busyLeft: () => 0 } }), hasRu: voiced, audioOf: () => null, log: l => logs.push(l),
    setTimer: fn => { timers.push(fn); return timers.length }, clearTimer() {} })
  const e = { show: t => shown.push(t) }
  return { v, e, said, shown, logs }
}

describe('голос перед ходом: ситуация и смысл', () => {
  it('pick — ситуация (озвучена), say — смысл; журнал говорит, что сказано', () => {
    const a = make()
    a.v.pre({ mode: 'pick', target: nice }, a.e)
    expect(a.said).toEqual(['ru:ты знакомишься с новым человеком'])
    expect(a.logs.at(-1)).toContain('ситуация «ты знакомишься с новым человеком»')
    const b = make()
    b.v.pre({ mode: 'say', target: nice }, b.e)
    expect(b.said).toEqual(['ru:скажи, что рад знакомству']); expect(b.logs.at(-1)).toContain('смысл «скажи, что рад знакомству»')
  })
  it('ситуация есть, но не озвучена — подпись ситуации без голоса (не смысл)', () => {
    const a = make(t => t !== nice.scene)
    a.v.pre({ mode: 'pick', target: nice }, a.e)
    expect(a.said).toEqual([]); expect(a.shown).toEqual(['ты знакомишься с новым человеком'])
  })
  it('без ситуации круг 1 говорит смысл (fallback); не озвучен — подпись смысла', () => {
    const a = make()
    a.v.pre({ mode: 'pick', target: bare }, a.e)
    expect(a.said).toEqual(['ru:попрощайся до скорого'])
    const b = make(() => false)
    b.v.pre({ mode: 'pick', target: bare }, b.e)
    expect(b.shown).toEqual(['попрощайся до скорого'])
  })
  it('ситуации попадают в фразы плана-симуляции и в набор озвучки / прогрева', () => {
    const plan = { source: 'sim', words: [], chunks: [] }
    expect(phrasesOf(plan)[0].scene).toBe('ты знакомишься с новым человеком')
    expect(transTexts(plan)).toContain('ты знакомишься с новым человеком')
    expect(sprintTransTexts(plan)).toContain('ты знакомишься с новым человеком')
  })
})
