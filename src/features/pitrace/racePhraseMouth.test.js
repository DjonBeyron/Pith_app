import { describe, it, expect, vi } from 'vitest'
import { phraseMouth, phraseEnvelope } from './racePhraseMouth.js'
import { createPhraseVoice } from './racePhraseVoice.js'

// Рот Пита на целой записи фразы «Фраз» (racePhraseMouth.js): огибающая буфера + формы по буквам; racePhraseVoice зовёт cat.speak с ненулевыми формами.
const RATE = 8000
// Буфер-заглушка: тишина 0,3 с → «голос» 0,4 с → пауза 0,2 с → «голос» 0,4 с → тишина 0,2 с
const fakeBuffer = () => {
  const parts = [[0.3, 0], [0.4, 0.5], [0.2, 0], [0.4, 0.5], [0.2, 0]]
  const data = new Float32Array(Math.round(parts.reduce((s, [d]) => s + d, 0) * RATE))
  let o = 0
  for (const [d, amp] of parts) { const n = Math.round(d * RATE); for (let i = 0; i < n; i++) data[o + i] = amp * Math.sin(i / 3); o += n }
  return { duration: data.length / RATE, sampleRate: RATE, numberOfChannels: 1, getChannelData: () => data }
}

describe('рот на целой записи фразы', () => {
  it('огибающая: 20 окон в секунду, есть голос', () => {
    const lv = phraseEnvelope(fakeBuffer())
    expect(lv.levels.length).toBe(30); expect(Math.max(...lv.levels)).toBe(1)
  })
  it('формы — только там, где в записи голос: не раньше тишины в начале и не в паузе', () => {
    const m = phraseMouth({ text: 'Nice to meet you', buffer: fakeBuffer() })
    expect(m.ms).toBe(1500); expect(m.points).toBe(30); expect(m.track.length).toBeGreaterThan(3)
    expect(m.track[0].at).toBeGreaterThanOrEqual(280)
    expect(m.track.at(-1).end).toBeLessThanOrEqual(1320)
    expect(m.track.some(s => (s.at + s.end) / 2 > 720 && (s.at + s.end) / 2 < 880)).toBe(false) // пауза 0,7…0,9 с — рот закрыт
  })
  it('скорость голоса: дорожка сжимается вместе с записью', () => {
    const m = phraseMouth({ text: 'Nice to meet you', buffer: fakeBuffer(), rate: 1.5 })
    expect(m.ms).toBe(1000); expect(m.track.at(-1).end).toBeLessThanOrEqual(890)
  })
  it('буфера нет — формы по буквам на всю длину файла, огибающая 0 точек', () => {
    const m = phraseMouth({ text: 'Nice to meet you', durationS: 1.2 })
    expect(m.points).toBe(0); expect(m.ms).toBe(1200); expect(m.track.length).toBeGreaterThan(3)
  })
  it('racePhraseVoice: целая запись → cat.speak с формами, журнал «[mouth] фраза …: огибающая N точек»', () => {
    const speak = vi.fn(), logs = []
    const cat = { busyLeft: () => 0, holdBusy: vi.fn(), onStop: () => () => {}, speak }
    const v = createPhraseVoice({ ctx: () => ({ cat }), audioOf: () => ({ url: 'r2/nice.mp3', duration: 1.5 }), play: () => 'buffer', mouth: p => phraseMouth({ text: p.text, buffer: fakeBuffer() }), log: l => logs.push(l), setTimer: () => 0, clearTimer: () => {} })
    v.pre({ mode: 'hear', target: { text: 'Nice to meet you' } }, {})
    expect(speak).toHaveBeenCalledTimes(1)
    const [track, ms, meta] = speak.mock.calls[0]
    expect(track.length).toBeGreaterThan(0); expect(track.every(s => s.code && s.code !== 'X')).toBe(true); expect(ms).toBe(1500); expect(meta.kind).toBe('фраза')
    expect(cat.holdBusy).toHaveBeenCalledWith(1500)
    expect(logs.some(l => /^\[mouth\] фраза «Nice to meet you»: огибающая 30 точек/.test(l))).toBe(true)
  })
})
