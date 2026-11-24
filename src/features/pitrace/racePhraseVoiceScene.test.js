import { describe, it, expect } from 'vitest'
import { createPhraseVoice } from './racePhraseVoice.js'
import { normalizePhrase, phrasesOf } from './racePhraseData.js'
import { transTexts, sprintTransTexts } from './raceTrans.js'

// «Скажи» — Пит говорит смысл (ru). Ситуацию (scene) говорил только круг 1 «Пойми» — он вырезан (владелец 2026-11-24): в игре её нет ни голосом, ни подписью, ни в прогреве
const nice = normalizePhrase({ text: 'Nice to meet you', ru: 'скажи, что рад знакомству', scene: 'ты знакомишься с новым человеком' })

function make(voiced = () => true) {
  const said = [], shown = [], logs = [], timers = []
  const v = createPhraseVoice({ ctx: () => ({ sayText: (t, o) => said.push(`${o?.ru ? 'ru' : 'en'}:${t}`), sayLine() {}, cat: { busyLeft: () => 0 } }), hasRu: voiced, audioOf: () => null, log: l => logs.push(l),
    setTimer: fn => { timers.push(fn); return timers.length }, clearTimer() {} })
  const e = { show: t => shown.push(t) }
  return { v, e, said, shown, logs }
}

describe('голос перед ходом: ситуация и смысл', () => {
  it('say — смысл; ситуацию (scene) вырезанного круга «Пойми» Пит не говорит и подписью не показывает', () => {
    const b = make()
    b.v.pre({ mode: 'say', target: nice }, b.e)
    expect(b.said).toEqual(['ru:скажи, что рад знакомству']); expect(b.logs.at(-1)).toContain('смысл «скажи, что рад знакомству»')
    const a = make(t => t !== nice.ru)
    a.v.pre({ mode: 'say', target: nice }, a.e)
    expect(a.said).toEqual([]); expect(a.shown).toEqual([nice.ru]) // смысл не озвучен — подпись смысла, не ситуации
  })
  it('ситуации остаются в данных фраз, но в набор озвучки / прогрева игры больше не идут', () => {
    const plan = { source: 'sim', words: [], chunks: [] }
    expect(phrasesOf(plan)[0].scene).toBe('ты знакомишься с новым человеком')
    expect(transTexts(plan)).not.toContain('ты знакомишься с новым человеком')
    expect(sprintTransTexts(plan)).not.toContain('ты знакомишься с новым человеком')
  })
})
