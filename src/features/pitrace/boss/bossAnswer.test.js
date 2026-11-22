import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { answerBackMs, markBossAnswer, takeBossAnswerAt, setBossAnswerAt, createTrail, lockAtAnswer, VOICE_STALE_MS } from './bossAnswer.js'
import { trackStep, marksStep, zoneAt } from './bossScale.js'

// Жалоба владельца (2026-11-22, финал «Шкала памяти»): «треугольник на линейке фиксируется ниже, чем есть на самом деле: он едет ниже по линейке, хотя ответ был выше».
// Слово принимается по итогу Vosk — через 549–698 мс после начала голоса (журнал iPhone v3.3.339: «голос начался» 17:14:07.914 → «claim» 17:14:08.490), а отметка вставала в миг зачёта.
const voice = (spoke, quiet) => ({ ms: () => spoke, quietMs: () => quiet })
const H = 600, V = 0.1 // шкала 600 px, линия идёт 0,1 px/мс (как пилюля финала на iPhone: ≈ 13 % высоты экрана в секунду)

/** Кадры шкалы, как в RaceBossScale: пилюля едет, голос начался в voiceAt, слово принято в claimAt (пилюля получает data-lock) → { tr, mark } после кадра зачёта */
function play({ voiceAt, claimAt, spoke = 300 }) {
  const el = {}, trail = createTrail()
  let tr = null, slots = []
  for (let t = 0; t <= claimAt + 16; t += 16) {
    const locked = t >= claimAt, yNow = Math.min(t, claimAt) * V
    const was = tr
    tr = trackStep(tr, [{ el, top: yNow - 80, bottom: yNow, locked, failed: false }], H, t)
    if (tr && !tr.done) trail.push(tr.id, t, tr.y)
    if (tr && tr.done && was !== tr && locked) {
      markBossAnswer(voice(spoke, claimAt - voiceAt - spoke), claimAt, claimAt) // директор в миг зачёта (useRaceActs.claim)
      tr = lockAtAnswer(tr, trail, takeBossAnswerAt())
    }
    slots = marksStep(slots, { id: tr ? tr.id : null, y: tr ? tr.y / H : 0, now: t, set: !!tr?.fixed && was !== tr })
  }
  return { tr, mark: slots.find(s => s.id === tr.id) }
}

describe('финал: отметка шкалы — там, где пилюля была в момент ОТВЕТА, а не зачёта', () => {
  it('жалоба: голос начался на 50 % шкалы, зачёт пришёл через 576 мс — треугольник и линия стоят на 50 %, а не на 59,6 %', () => {
    const { tr, mark } = play({ voiceAt: 3000, claimAt: 3576 })
    expect(tr.y / H).toBeCloseTo(0.5, 2); expect(mark.y).toBeCloseTo(0.5, 2)
    expect(mark.y).toBeLessThan(3576 * V / H - 0.08) // было: 0,596 — на 9,6 % длины шкалы ниже ответа
  })
  it('зона слова — по моменту ответа: начал говорить в жёлтой, зачёт пришёл уже в красной — слово жёлтое (XP не теряется)', () => {
    const { tr } = play({ voiceAt: 4600, claimAt: 5200 })
    expect(zoneAt(5200 * V / H)).toBe('slow'); expect(zoneAt(tr.y / H)).toBe('mid')
  })
  it('после зачёта отметка больше не едет: следующие кадры её не двигают', () => {
    const { tr, mark } = play({ voiceAt: 3000, claimAt: 3576 })
    const later = marksStep([mark], { id: tr.id, y: tr.y / H, now: 5000 })
    expect(later[0].y).toBe(mark.y)
  })
  it('тап вместо голоса и ответ без голоса: поправки нет, отметка в миг зачёта', () => {
    expect(answerBackMs(voice(0, null), 4000)).toBe(0); expect(answerBackMs(null, 4000)).toBe(0); expect(answerBackMs({}, 4000)).toBe(0)
    setBossAnswerAt(null)
    const trail = createTrail(); trail.push(1, 0, 0); trail.push(1, 1000, 100)
    const tr = { id: 1, y: 100, done: true }
    expect(lockAtAnswer(tr, trail, takeBossAnswerAt())).toBe(tr)
  })
  it('поправка из счётчика голоса: длина голоса + тишина после него (журнал: 299 + 277 = 576 мс); не дальше выезда пилюли; старый голос — не этот ответ', () => {
    expect(answerBackMs(voice(299, 277), 7355)).toBe(576)
    expect(answerBackMs(voice(900, 300), 800)).toBe(800)
    expect(answerBackMs(voice(400, VOICE_STALE_MS + 1), 9000)).toBe(0)
    expect(markBossAnswer(voice(299, 277), 7355, 10000)).toBe(576); expect(takeBossAnswerAt()).toBe(10000 - 576); expect(takeBossAnswerAt()).toBeNull() // забирается один раз
  })
  it('след: между точками — по прямой; ответ начат до касания шкалы — верх следа; отметка никогда не ниже зачёта', () => {
    const tr = createTrail(); for (let t = 0; t <= 2000; t += 100) tr.push(7, t, t * V)
    expect(tr.yAt(1050, 200)).toBeCloseTo(105, 5); expect(tr.yAt(-500, 200)).toBe(0); expect(tr.yAt(5000, 200)).toBe(200); expect(tr.yAt(null, 200)).toBe(200)
    expect(tr.yAt(1900, 150)).toBe(150)
    tr.push(8, 3000, 10); expect(tr.yAt(1000, 10)).toBe(10) // новое слово — след с нуля
  })
})

describe('проводка: директор сообщает шкале момент ответа, шкала ставит отметку туда', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('useRaceActs.claim (только финал) → markBossAnswer; RaceBossScale: след, отметка, зона для XP', () => {
    expect(read('../useRaceActs.js')).toContain("if (running.act === 'boss') { const back = markBossAnswer(listenerRef?.current?.voice, ms)")
    const scale = read('./RaceBossScale.jsx')
    expect(scale).toContain('trail.push(tr.id, now, tr.y)'); expect(scale).toContain('lockAtAnswer(tr, trail, takeBossAnswerAt())'); expect(scale).toContain('set: !!tr?.fixed && was !== tr')
    expect(read('../../../styles/player/modules/race-boss.css')).toMatch(/\.wlBossMark\[data-set\] \{[^}]*transition:[^}]*transform/)
  })
})
