import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { isCircleEnd, circleHoldMs, waitCircleSpeech, revLineAfterMia, jumpAfterPush, syncJump, CIRCLE_KEEP_HOLD_MS, CIRCLE_WIN_TAIL_MS, CIRCLE_POLL_MS, CIRCLE_WAIT_CAP_MS, JUMP_PAD_MS } from './miaCircleEnd.js'
import { reduceMia, miaInit, MIA } from './raceMia.js'
import { createMiaSpeech } from './miaSpeech.js'
import { ARR, LEAVE, SOLO, PANIC_LEN } from './miaMotion.js'
import { buildRaceStages } from '../raceStages.js'
import { withPhrases } from '../racePhraseData.js'
import { PHRASE_FIXTURE } from '../racePhraseFixture.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'

// «Допрос у Мии» после правки сценария (владелец 2026-11-24): всё, что идёт «после реплики», ждёт РЕАЛЬНЫЙ конец звука, а не числа, подобранные под прежние длины и прежний состав реплик
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const end = act => ({ type: 'announce', act, sid: `${act}3-end`, mia: 'end', ms: 18000 })
const won = (act = 'sprint') => ({ ...miaInit(), phase: 'in', act, fast: true, rtotal: 2, rwon: { 0: true, 1: true } })
const lost = (act = 'sprint') => ({ ...won(act), rwon: { 0: true } })
const plan = () => withPhrases(normalizePlan({ ...fixturePlan('three'), source: 'node', game: 'race' }), { phrases: PHRASE_FIXTURE })

describe('церемония «Допроса»: очередь по концу звука', () => {
  it('сроков REPLY_AT / ANNOUNCE*_AT больше нет: после mia_push и «Мяяяу» реплики не ждут «своего времени», а идут одна за другой', () => {
    for (const k of ['ANNOUNCE_AT', 'REPLY_AT', 'ANNOUNCE2_AT', 'ANNOUNCE3_AT']) expect(MIA[k]).toBeUndefined()
    const r = reduceMia(miaInit(), { t: 'enter', stage: { type: 'announce', act: 'sprint', sid: 'sprint3-ann', mia: 'ann', line: 'pit_forgot' }, now: 0 })
    expect(r.say.map(c => c.id)).toEqual(['mia_push', 'pit_panic', 'pit_reply', 'mia_announce_2', 'mia_announce_3'])
    expect(r.say.map(c => c.delay)).toEqual([MIA.PUSH_AT, MIA.PANIC_AT, MIA.PANIC_AT, MIA.PANIC_AT, MIA.PANIC_AT])
  })
  it('очередь речи: короткие реплики — между ними только пауза mia.gap (раньше «зря стараешься…» ждала отметки 8,8 с); длинные — не накладываются', () => {
    for (const len of [900, 4000]) { // все реплики по 0,9 с и все по 4 с
      let t = 0; const timers = []; const starts = []
      const sp = createMiaSpeech({ now: () => t, setTimer: (fn, ms) => { const o = { fn, at: t + ms }; timers.push(o); return o }, clearTimer: o => { const i = timers.indexOf(o); if (i >= 0) timers.splice(i, 1) }, has: () => true, bufferMs: () => len,
        play: (key, _r, onStart, onEnd) => { onStart(); const o = { fn: onEnd, at: t + len }; timers.push(o); return true }, trace: (k, d) => { if (k === 'line-start') starts.push([d.id, t]) } })
      sp.use({ lines: Object.fromEntries(['mia_push', 'pit_panic', 'pit_reply', 'mia_announce_2', 'mia_announce_3'].map(id => [id, { text: 'x', url: 'u', duration: len / 1000 }])), cat: { busyLeft: () => 0, holdBusy() {}, sayLine: (id, _v, o) => { starts.push([id, t]); timers.push({ fn: o.onEnd, at: t + len }); return true } } })
      sp.enqueue(reduceMia(miaInit(), { t: 'enter', stage: { act: 'sprint', mia: 'ann' }, now: 0 }).say, 0)
      for (let n = 0; n < 4000 && timers.length; n++) { timers.sort((a, b) => a.at - b.at); const o = timers.shift(); t = Math.max(t, o.at); o.fn() }
      expect(starts.map(s => s[0])).toEqual(['mia_push', 'pit_panic', 'pit_reply', 'mia_announce_2', 'mia_announce_3'])
      const gaps = starts.slice(1).map((s, i) => s[1] - (starts[i][1] + len)) // тишина между концом реплики и началом следующей
      if (len === 4000) for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(350); expect(g).toBeLessThanOrEqual(600) } // длинные: ни наложения, ни дыр
      else { expect(gaps[0]).toBeGreaterThan(600); for (const g of gaps.slice(1)) expect(g).toBeLessThanOrEqual(600) } // короткие: ждём только «Мяяяу» (PANIC_AT: Пит мечется после падения коробки), дальше — подряд
    }
  })
  it('Мия прыгает на коробку не раньше, чем договорит из-за края (mia_push стала длиннее): срок прыжка сдвигается по длине звука; короткая реплика срок не трогает; экзамен — не здесь', () => {
    const m = { ...miaInit(), phase: 'in', act: 'sprint', at: 10000, jump: null }
    expect(jumpAfterPush(m, { id: 'mia_push', ms: 3600 }, 10900).jump).toBeCloseTo((900 + 3600 + JUMP_PAD_MS) / 1000, 2) // кончит через 4,65 с после падения коробки — позже ARR.JUMP 3,9 с
    expect(jumpAfterPush(m, { id: 'mia_push', ms: 2000 }, 10900)).toBeNull() // кончит раньше 3,9 с — прыжок как был
    expect(ARR.JUMP).toBe(3.9)
    expect(jumpAfterPush(m, { id: 'mia_announce_2', ms: 9000 }, 10900)).toBeNull(); expect(jumpAfterPush({ ...m, act: 'boss' }, { id: 'mia_push', ms: 9000 }, 10900)).toBeNull(); expect(jumpAfterPush(m, null)).toBeNull()
    const mb = { m }; const j = syncJump(mb, { id: 'mia_push', ms: 3600 }, 10900); expect(mb.m).toBe(j); expect(mb.m.jump).toBeGreaterThan(ARR.JUMP)
    expect(syncJump(mb, { id: 'mia_push', ms: 100 }, 10900)).toBeNull()
  })
})

describe('конец «Допроса»: все слова верны', () => {
  it('Мия «твоя взяла…» и Пит «спасибо за помощь…» — очередью без сроков «от события»; pit_back_2 в очереди конца нет', () => {
    const r = reduceMia(won(), { t: 'enter', stage: end('sprint'), now: 0 })
    expect(r.say.map(c => [c.id, c.delay])).toEqual([['mia_leave', 0], ['pit_back_1', 0]])
  })
  it('стадия держится минимум на отлёт Мии, а отпускает её пустая очередь речи — не формула из длин и сроков', () => {
    expect(isCircleEnd(end('sprint'))).toBe(true); expect(isCircleEnd({ ...end('boss'), act: 'boss' })).toBe(false); expect(isCircleEnd({ mia: 'round', act: 'sprint' })).toBe(false)
    const m = reduceMia(won(), { t: 'enter', stage: end('sprint'), now: 0 }).mia
    expect(circleHoldMs(end('sprint'), m)).toBe(Math.round(LEAVE.END * 1000) + CIRCLE_WIN_TAIL_MS)
    expect(circleHoldMs({ ...end('sprint'), preWait: 700 }, m)).toBe(700 + Math.round(LEAVE.END * 1000) + CIRCLE_WIN_TAIL_MS)
    let left = 3; const later = vi.fn((fn) => { left -= 1; fn() }); const go = vi.fn()
    waitCircleSpeech({ st: end('sprint'), m, pending: () => left, later, go })
    expect(go).toHaveBeenCalledTimes(1); expect(later).toHaveBeenCalledTimes(3); expect(later.mock.calls[0][1]).toBe(CIRCLE_POLL_MS)
    let t = 0; const go2 = vi.fn(); waitCircleSpeech({ st: end('sprint'), m, pending: () => 1, later: fn => { t += CIRCLE_WAIT_CAP_MS / 4; if (t <= CIRCLE_WAIT_CAP_MS * 2) fn() }, go: go2, now: () => t })
    expect(go2).toHaveBeenCalledTimes(1) // страховка: речь не держит стадию вечно
    const go3 = vi.fn(); waitCircleSpeech({ st: { ...end('boss'), act: 'boss' }, m, pending: () => 5, later: () => {}, go: go3 }); expect(go3).toHaveBeenCalledTimes(1) // экзамен — сразу, как был
  })
  it('после прохода A голосом: реплику разворота race_reverse заменяет pit_back_2 — Пит говорит её вместе с анимацией разворота; в тапе и после прохода B замены нет', () => {
    const m = reduceMia(won(), { t: 'enter', stage: end('sprint'), now: 0 }).mia
    const voice = buildRaceStages({ plan: plan(), tap: false, ru: true }).stages
    expect(voice.find(s => s.sid === 'catch-rev').line).toBe('race_reverse')
    expect(revLineAfterMia(voice, voice.find(s => s.sid === 'sprint3-end'), m)).toBe(true)
    expect(voice.find(s => s.sid === 'catch-rev')).toMatchObject({ line: 'pit_back_2', rev: expect.any(Number) })
    expect(revLineAfterMia(voice, voice.find(s => s.sid === 'sprint3-end'), m)).toBe(false) // второй раз менять нечего
    const tap = buildRaceStages({ plan: plan(), tap: true, ru: true }).stages
    expect(revLineAfterMia(tap, tap.find(s => s.sid === 'sprint3-end'), m)).toBe(false); expect(tap.find(s => s.sid === 'catch-rev').line).toBe('race_reverse_tap')
    const b = buildRaceStages({ plan: plan(), tap: false, ru: true }).stages, mB = reduceMia(won('catch'), { t: 'enter', stage: end('catch'), now: 0 })
    expect(mB.say.map(c => c.id)).toEqual(['mia_leave', 'pit_back_1']) // после B дальше фразы: «теперь я говорю по-английски…» не звучит
    expect(revLineAfterMia(b, b.find(s => s.sid === 'catch3-end'), mB.mia)).toBe(false); expect(b.find(s => s.sid === 'catch-rev').line).toBe('race_reverse')
    const mLost = reduceMia(lost(), { t: 'enter', stage: end('sprint'), now: 0 }).mia
    expect(revLineAfterMia(b, b.find(s => s.sid === 'sprint3-end'), mLost)).toBe(false) // с ошибками — обычная реплика разворота
  })
})

describe('конец «Допроса»: есть ошибки (коробка остаётся на Пите)', () => {
  it('Пит «Эй, ты куда?…» идёт параллельно прыжку Мии и тряске коробки: срок реплики — с толчка Мии, тряска — сразу за её уходом, «Не получается…» — когда тряска и реплика кончились', () => {
    expect(SOLO.TRY_AT).toBe(SOLO.CROUCH); expect(SOLO.TRY_AT).toBeLessThan(SOLO.END) // реплика — раньше, чем Мия скрылась
    const src = read('../RaceMia.jsx')
    expect(src).toContain("if (!c.tried && c.sl >= SOLO.TRY_AT) { c.tried = true; c.tryEnd = c.arr + (cbRef.current.onTry?.() ?? 0) / 1000 + SOLO.AFTER_TRY }")
    expect(src).toContain("if (so.done) { c.mode = 'rave'; c.rv = 0 }")
    expect(src).toContain("c.rv >= PANIC_LEN + SOLO.SETTLE && c.arr >= (c.tryEnd ?? 0)")
    expect(src).not.toContain("c.mode === 'try'") // отдельной «паузы, потом реплики, потом тряски» больше нет
    expect(Math.round((SOLO.END - SOLO.TRY_AT + PANIC_LEN + SOLO.SETTLE) * 1000)).toBeGreaterThan(2500) // на реплику ≈ 3,3 с анимации: она в них укладывается, а не добавляется к ним
  })
  it('очередь: Мия — вердикт; Пит — «Эй, ты куда?…», «Не получается…»; коробка снята — «Ух, спасибо вам, эти слова мы ещё встретим» (boss_pit_free, сценарий владельца), стадию отпускает конец речи', () => {
    const r = reduceMia(lost(), { t: 'enter', stage: end('sprint'), now: 0, keepMs: 3000 })
    expect(r.say.map(c => c.id)).toEqual(['boss_mia_keep']); expect(r.mia).toMatchObject({ solo: 'keep', soloAt: 3000 })
    expect(circleHoldMs(end('sprint'), r.mia)).toBe(CIRCLE_KEEP_HOLD_MS)
    const tr = reduceMia(r.mia, { t: 'try', now: 1 }); expect(tr.say.map(c => c.id)).toEqual(['boss_pit_try'])
    const st = reduceMia(r.mia, { t: 'stuck', now: 2 }); expect(st.say.map(c => c.id)).toEqual(['boss_pit_stuck'])
    const fr = reduceMia(st.mia, { t: 'free', now: 3 }); expect(fr.say.map(c => [c.id, c.delay])).toEqual([['boss_pit_free', 1300]]); expect(fr.mia).toMatchObject({ phase: 'out', why: 'freed', alone: true })
    const box = read('./useMiaBoxFree.js')
    expect(box).not.toContain("msOf('pit_back_1'"); expect(box).toContain('if (mspeech.pending() > 0) later(said, SPEECH_POLL_MS)')
  })
})

describe('проводка в директоре гонки', () => {
  it('useRaceActs: конец «Допроса» — circleHoldMs, замена реплики разворота на переходе, срок прыжка — по реплике Мии; экзамен — прежний endHoldMs', () => {
    const src = read('../useRaceActs.js')
    expect(src).toContain('if (isCircleEnd(st)) return circleHoldMs(st, mb.m)')
    expect(src).toContain("st?.mia !== 'end' ? rh.holdMs(st) : endHoldMs(st, mb, mspeech)")
    expect(src).toContain('revLineAfterMia(stages, stages[i - 1], mb.m)'); expect(src).toContain('syncJump(mb, c)')
  })
})
