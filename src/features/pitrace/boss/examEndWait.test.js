import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { afterSpeech, whenReady, examEndReady, END_TAIL_MS, END_POLL_MS, DRAIN_CAP_MS, END_CAP_MS } from './examEndWait.js'
import { endHoldMs } from './raceEndHold.js'
import { revealAtMs, demoPlan, demoSync, REVEAL_AT, DEMO_MOVE_MS } from './bossScale.js'
import { bossStages, BOSS_END_MS, BOSS_HOLD_MAX_MS, BOSS_EXIT_MS } from './raceStagesBoss.js'
import { createStudentGame, stepStudent, MAX_HOLD_MS } from '../../player/modules/rotate-phone/wordLaneStudent.js'
import { buildRecipe } from '../../player/modules/rotate-phone/wordLaneRecipe.js'

// Привязки экзамена к длине звука (владелец 2026-11-24: «обновил озвучку»): всё, что идёт после реплики или во время неё, ведёт реальный конец / начало звука и запись реплики, а не число под старый файл.
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
function clock() {
  let t = 0, id = 0; const timers = new Map()
  return { now: () => t, setTimer: (fn, ms) => { const k = ++id; timers.set(k, { fn, at: t + ms }); return k }, clearTimer: k => timers.delete(k),
    advance(ms) { const end = t + ms; for (;;) { const n = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!n) break; t = n[1].at; timers.delete(n[0]); n[1].fn() } t = end } }
}

describe('реплики исхода — когда очередь речи реально опустела (было: расчётное время + 450 мс)', () => {
  it('очередь пуста — сразу; занята — в первый же опрос после её конца, какой бы длины ни была реплика', () => {
    const c = clock(), mb = {}; let left = 0, went = -1
    afterSpeech(mb, () => left, () => { went = c.now() }, c); expect(went).toBe(0)
    for (const len of [900, 4300]) { left = 2; went = -1; const t0 = c.now(); afterSpeech(mb, () => left, () => { went = c.now() }, c); c.advance(len); expect(went).toBe(-1); left = 0; c.advance(END_POLL_MS); expect(went - t0).toBeGreaterThanOrEqual(len); expect(went - t0).toBeLessThanOrEqual(len + END_POLL_MS) }
  })
  it('страховка: речь встала насовсем — не дольше DRAIN_CAP_MS; таймер лежит в mb.endTimer (его снимает уход из игры)', () => {
    const c = clock(), mb = {}; let went = -1
    afterSpeech(mb, () => 1, () => { went = c.now() }, c); expect(mb.endTimer).toBeTruthy(); c.advance(DRAIN_CAP_MS + END_POLL_MS); expect(went).toBeGreaterThanOrEqual(DRAIN_CAP_MS); expect(mb.endTimer).toBe(0)
  })
  it('подключено: вход на стадию-конец экзамена ждёт очередь речи', () => {
    expect(read('../mia/useMiaEnter.js')).toContain("if (running.mia === 'end' && running.act === 'boss') { afterSpeech(mb, () => mspeech.pending(), go); return undefined }")
  })
})

describe('стадию-конец экзамена отпускает реальный конец речи и ухода Мии (было: сумма длин реплик + 800 мс, потолок 18 с)', () => {
  it('готово: реплики исхода поставлены, очередь пуста, Мия уже ушла или остаётся; пока она ждёт конца своей реплики (bye) — не готово', () => {
    const idle = () => 0, busy = () => 1
    expect(examEndReady({ phase: 'in', act: 'boss', outcome: '' }, idle)).toBe(false) // исход ещё не объявлен
    expect(examEndReady({ phase: 'in', act: 'boss', outcome: 'free', bye: 'boss_mia_bye' }, idle)).toBe(false) // Мия ещё не ушла
    expect(examEndReady({ phase: 'out', act: 'boss', outcome: 'free', bye: null }, busy)).toBe(false) // Пит ещё говорит
    expect(examEndReady({ phase: 'out', act: 'boss', outcome: 'free', bye: null }, idle)).toBe(true)
    expect(examEndReady({ phase: 'in', act: 'boss', outcome: 'stay', bye: null }, idle)).toBe(true)
    expect(examEndReady({ phase: 'off', act: '' }, idle)).toBe(true) // эпизод выключен — ждать нечего
  })
  it('длинная озвучка не обрезается, короткая не оставляет тишины: итог — через END_TAIL_MS после реального конца', () => {
    for (const len of [3000, 26000]) { const c = clock(); let ok = false, went = -1; whenReady({ ready: () => ok, go: () => { went = c.now() }, ...c }); c.advance(len); expect(went).toBe(-1); ok = true; c.advance(END_POLL_MS + END_TAIL_MS); expect(went).toBeGreaterThanOrEqual(len + END_TAIL_MS); expect(went).toBeLessThanOrEqual(len + END_POLL_MS + END_TAIL_MS) }
    expect(END_TAIL_MS).toBeLessThanOrEqual(600) // тишина перед итогом — не дольше ~0,6 с
  })
  it('страховка END_CAP_MS и отмена (смена стадии, пауза)', () => {
    const c = clock(); let went = -1; whenReady({ ready: () => false, go: () => { went = c.now() }, ...c }); c.advance(END_CAP_MS + END_POLL_MS); expect(went).toBeGreaterThanOrEqual(END_CAP_MS)
    const c2 = clock(); let n = 0; const cancel = whenReady({ ready: () => false, go: () => { n++ }, ...c2 }); c2.advance(500); cancel(); c2.advance(END_CAP_MS * 2); expect(n).toBe(0)
  })
  it('оценки по длинам у экзамена больше нет: стадия держится минимум, какой бы ни была озвучка; подпись неозвученной реплики тоже ждут', () => {
    const st = { act: 'boss', mia: 'end', ms: BOSS_END_MS, preWait: 5000 }
    expect(endHoldMs(st, { m: {} }, { msOf: () => 99999 })).toBe(BOSS_END_MS); expect(endHoldMs(st, { m: {} }, { msOf: () => 1 })).toBe(BOSS_END_MS)
    expect(read('./examEndWait.js')).toContain('ready: () => !captionOn() && examEndReady(mb.m, () => mspeech.pending())')
    expect(read('./useExamSpeech.js')).toContain("if (k === 'line-end' && d?.who === 'mia' && !d.why)") // уход Мии — по реальному концу её звука; сброс очереди (why: stop) концом не считается
  })
})

describe('шкала появляется на слове «шкала» по записи реплики (было: 55 % длины реплики)', () => {
  const text = 'Эй, вы за экраном, это экзамен для вашей памяти, шкала покажет, насколько крепко вы помните слова'
  it('есть тайминги слов — момент слова в файле, приведённый к длине звука', () => {
    const words = text.split(' ').map((w, i) => ({ w, t: i * 0.4, e: i * 0.4 + 0.3 })), i = text.split(' ').findIndex(w => w.startsWith('шкала'))
    expect(revealAtMs({ text, words, duration: 6.4 }, 6400)).toBe(Math.round(i * 400))
    expect(revealAtMs({ text, words, duration: 6.4 }, 3200)).toBe(Math.round(i * 200)) // звук играет вдвое быстрее — срок тоже
  })
  it('таймингов нет — по месту слова в тексте; текст заменили — срок едет вместе со словом; слова нет — запасная доля', () => {
    expect(revealAtMs({ text }, 6000)).toBe(Math.round(6000 * text.indexOf('шкал') / text.length))
    expect(revealAtMs({ text: 'Шкала покажет всё' }, 2000)).toBe(0)
    expect(revealAtMs({ text: 'Смотрите направо' }, 2000)).toBe(Math.round(2000 * REVEAL_AT)); expect(revealAtMs(null, 1000)).toBe(Math.round(1000 * REVEAL_AT))
  })
  it('подключено: срок считает очередь речи на начале звука, хук показа берёт его', () => {
    expect(read('./useExamSpeech.js')).toContain('revealMs: revealAtMs(src.lines?.[c.id] ?? { text: c.text }, c.ms)'); expect(read('./useBossReveal.js')).toContain('talk?.revealMs ??')
  })
})

describe('пример-пилюля сверяется с реальным началом каждой реплики объяснения (было: один план по оценке длин на старте)', () => {
  const plan = demoPlan({ look: 6000, green: 2800, yellow: 3000, red: 2600, five: 4900 }, 350)
  it('реплика началась позже плана — часы примера возвращаются на её начало (пилюля стоит в центре зоны и ждёт); раньше — догоняют', () => {
    expect(demoSync(plan, 'yellow', plan.starts.yellow + 700)).toBe(plan.starts.yellow); expect(plan.pos(plan.starts.yellow)).toBe(plan.pos(plan.starts.yellow + 700)) // на экране без скачка: обе точки — центр жёлтой зоны
    expect(demoSync(plan, 'red', plan.starts.red - 400)).toBe(plan.starts.red)
    expect(plan.starts.yellow + 700).toBeLessThan(plan.starts.red - DEMO_MOVE_MS)
  })
  it('на «условии» пилюля уже улетает — назад не возвращается; неизвестная реплика часы не трогает', () => {
    expect(demoSync(plan, 'five', plan.starts.five + 500)).toBe(plan.starts.five + 500); expect(demoSync(plan, 'five', plan.starts.five - 300)).toBe(plan.starts.five); expect(demoSync(plan, 'hush', 123)).toBe(123)
  })
  it('пауза очереди в плане — действующая настройка mia.gap, а не константа; подключение сверки', () => {
    expect(demoPlan({ look: 1000, green: 1000, yellow: 1000, red: 1000, five: 1000 }, 900).starts.green).toBe(1900)
    expect(read('./useExamSpeech.js')).toContain('miaGap()), mark: null })'); expect(read('./RaceBossScale.jsx')).toContain('d.t = demoSync(d.plan, demo.mark.k, d.t)')
  })
})

describe('пилюля экзамена ждёт конца длинной цепочки речи (общий потолок движка 8 с её не обрывает)', () => {
  const chunks = ['try'], step = buildRecipe(chunks).rounds[0].steps[0], DT = 16
  const firstSpawn = (g, until) => { for (let t = 0; t <= until; t += DT) if (stepStudent(g, t, { hold: t < 12000 }).some(e => e.type === 'spawn')) return t; return -1 }
  it('обычная ступень: речь 12 с — пилюля выезжает на потолке 8 с; ступень экзамена (holdMax) — после конца речи', () => {
    const plain = firstSpawn(createStudentGame({ step, chunks }), 15000); expect(plain).toBeGreaterThan(MAX_HOLD_MS); expect(plain).toBeLessThan(12000)
    const exam = firstSpawn(createStudentGame({ step: { ...step, holdMax: BOSS_HOLD_MAX_MS }, chunks }), 15000); expect(exam).toBeGreaterThanOrEqual(12000); expect(exam).toBeLessThan(12000 + 3 * DT)
  })
  it('бюджет времени ступени считает настоящую жизнь медленной пилюли экзамена: три «не успел» подряд — все три слова выезжают (раньше третье слово блока пропадало: «время ступени вышло»)', () => {
    const three = ['one', 'two', 'six'], st = buildRecipe(three).rounds[0].steps[0], slow = { ...st, maxTries: 1, overlap: false, reps: three.map((_, i) => ({ parts: [i], lane: 1, speed: 0.5 })) }
    const spawns = step2 => { const g = createStudentGame({ step: step2, chunks: three, maxTries: 1 }); let n = 0; for (let t = 0; t <= 60000; t += DT) for (const e of stepStudent(g, t, {})) if (e.type === 'spawn') n++; return { n, budget: g.budget } }
    const fast = spawns({ ...slow, reps: slow.reps.map(r => ({ ...r, speed: 1 })) }), exam = spawns(slow)
    expect(exam.n).toBe(3); expect(exam.budget).toBeGreaterThan(fast.budget * 1.6); expect(fast.n).toBe(3)
    expect(spawns({ ...slow, reps: slow.reps.map(r => ({ ...r, speed: 1.4 })) }).budget).toBe(fast.budget) // быстрые пилюли бюджет не уменьшают
  })
  it('у обоих кругов экзамена свой потолок; выход из круга — время взлёта пилюли; заставка — стадия эпизода (не получает ноты стартовой плашки)', () => {
    const stages = [], kit = { stages, plan: { seed: 1 }, chunks: [], msOf: () => 500, doubles: () => [], push: s => { stages.push({ ...s, idx: stages.length }); return s }, announce: (act, o = {}) => kit.push({ type: 'announce', act: act.id, sid: `${o.sid ?? act.id}-ann`, ms: o.ms, line: o.line ?? null }) }
    bossStages(kit, { id: 'boss', title: 'Шкала памяти', brief: '', words: ['a', 'b', 'c', 'd'].map(text => ({ text, translation: `${text}-ру`, confusers: [] })) }, { voice: true })
    expect(stages.filter(s => s.type === 'student').map(s => [s.sid, s.step.holdMax])).toEqual([['boss', BOSS_HOLD_MAX_MS], ['boss2', BOSS_HOLD_MAX_MS]]); expect(BOSS_HOLD_MAX_MS).toBeGreaterThan(MAX_HOLD_MS)
    expect(stages[0]).toMatchObject({ sid: 'boss-intro-ann', mia: 'intro', always: true }); expect(BOSS_EXIT_MS).toBeLessThan(1300)
    expect(read('../raceStages.js')).toContain("if (first?.type === 'announce' && !first.mia)")
  })
})
