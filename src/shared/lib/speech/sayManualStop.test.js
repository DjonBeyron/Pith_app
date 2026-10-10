import { describe, it, expect } from 'vitest'
import { sayReducer, initialSayState } from './sayFlow.js'
import { silenceHintAllowed, heardAnything, STOP_MANUAL, STOP_AUTO } from './sayHints.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Ручная остановка записи учеником (повторный тап по кругу): если распознавать было нечего — это отмена, а не «не слышу вас…». Автоостановка по тишине — как раньше.
const data = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })
const alt = text => ({ text, confidence: 0.9 })
const base = { ...emptyView, runNo: 1, attempt: 1 }
const start = () => sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data })
const run = (s, reason, view) => sayReducer(reason ? sayReducer(s, { type: 'stop', reason }) : s, { type: 'view', view: { ...base, ...view } })
const NOTHING = { status: 'done', final: null, alternatives: [] }
const QUIET_ERR = { status: 'error', error: 'no-speech' }

describe('silenceHintAllowed(stopReason, heardAnything) — все комбинации', () => {
  it('ручная остановка без распознанного — подсказки нет; во всех остальных комбинациях подсказка разрешена', () => {
    expect(silenceHintAllowed(STOP_MANUAL, false)).toBe(false)
    expect(silenceHintAllowed(STOP_MANUAL, true)).toBe(true)
    expect(silenceHintAllowed(STOP_AUTO, false)).toBe(true)
    expect(silenceHintAllowed(STOP_AUTO, true)).toBe(true)
    expect(silenceHintAllowed(null, false)).toBe(true)
    expect(silenceHintAllowed(undefined, false)).toBe(true)
    expect(silenceHintAllowed(null, true)).toBe(true)
  })

  it('heardAnything: итоговый или промежуточный текст; пустое, пробелы и отсутствие — нет', () => {
    expect(heardAnything({ final: alt('hello') })).toBe(true)
    expect(heardAnything({ final: null, lastInterim: 'hel' })).toBe(true)
    expect(heardAnything({ final: alt('  '), lastInterim: ' ' })).toBe(false)
    expect(heardAnything({ final: null, lastInterim: '' })).toBe(false)
    expect(heardAnything(null)).toBe(false)
  })
})

describe('sayFlow: ручная остановка', () => {
  it('stop меняет причину только в записи; begin её сбрасывает', () => {
    const idle = initialSayState({ action: 'listen' })
    expect(sayReducer(idle, { type: 'stop', reason: STOP_MANUAL }).stopReason).toBeNull()
    const s = sayReducer(start(), { type: 'stop', reason: STOP_MANUAL })
    expect(s.stopReason).toBe(STOP_MANUAL)
    expect(sayReducer(s, { type: 'begin', data }).stopReason).toBeNull()
  })

  it('ручная остановка до речи (done без итога): круг снова готов, подсказки и реплики нет, попытка и серия тишин не меняются, событие — «stopped»', () => {
    const s = run(start(), STOP_MANUAL, NOTHING)
    expect(s).toMatchObject({ phase: 'idle', hint: null, reply: null, verdict: null, errorCode: null, attempts: 0, silences: 0, failStreak: 0, exhausted: false, settledRun: 1 })
    expect(s.event.extra).toMatchObject({ passed: false, reason: 'stopped' })
  })

  it('ручная остановка и тихая ошибка движка (no-speech / silence) — то же: отмена', () => {
    for (const error of ['no-speech', 'silence']) {
      const s = run(start(), STOP_MANUAL, { status: 'error', error })
      expect(s, error).toMatchObject({ phase: 'idle', hint: null, reply: null, attempts: 0, silences: 0 })
    }
  })

  it('отмена не сбивает серию: две тишины, ручная остановка, ещё тишина — это третья, а не четвёртая', () => {
    let s = run(start(), null, QUIET_ERR)
    s = run({ ...sayReducer(s, { type: 'begin', data }) }, null, { ...QUIET_ERR, runNo: 2 })
    expect(s.silences).toBe(2)
    s = run(sayReducer(s, { type: 'begin', data }), STOP_MANUAL, { ...NOTHING, runNo: 3 })
    expect(s).toMatchObject({ phase: 'idle', silences: 2, attempts: 0 })
    s = run(sayReducer(s, { type: 'begin', data }), null, { ...QUIET_ERR, runNo: 4 })
    expect(s).toMatchObject({ attempts: 1, silences: 0, phase: 'failed' }) // третья тишина подряд = одна неудача
  })

  it('автоостановка по тишине (причины нет) — hintSilence и «тишина» в серии, как раньше', () => {
    for (const view of [NOTHING, QUIET_ERR]) {
      const s = run(start(), null, view)
      expect(s).toMatchObject({ phase: 'failed', silences: 1, attempts: 0, failStreak: 1 })
      expect(s.hint.kind).toBe('silence')
      expect(s.reply).toBeNull()
    }
  })

  it('ручная остановка, когда что-то уже распознано (даже неверное): настоящая попытка — реплика ученика + подсказка по результату, попытка потрачена', () => {
    const s = run(start(), STOP_MANUAL, { status: 'done', final: alt('banana apple'), alternatives: [alt('banana apple')] })
    expect(s).toMatchObject({ phase: 'failed', attempts: 1, failStreak: 1 })
    expect(s.reply.text).toBe('Banana apple')
    expect(s.hint.kind).toBe('mismatch')
  })

  it('ручная остановка с верной фразой — успех, как раньше', () => {
    const s = run(start(), STOP_MANUAL, { status: 'done', final: alt('I am trying to please both'), alternatives: [alt('I am trying to please both')] })
    expect(s.phase).toBe('passed')
  })

  it('ручная остановка, но промежуточный текст был (итога нет): это не отмена — прежнее поведение (подсказка по тишине в чат)', () => {
    const s = run(start(), STOP_MANUAL, { ...NOTHING, lastInterim: 'banana' })
    expect(s.phase).toBe('failed')
    expect(s.hint.kind).toBe('silence')
  })

  it('настоящая ошибка (микрофон занят, сеть) при ручной остановке отменой не считается', () => {
    const s = run(start(), STOP_MANUAL, { status: 'error', error: 'network' })
    expect(s.phase).toBe('failed')
    const denied = run(start(), STOP_MANUAL, { status: 'error', error: 'not-allowed' })
    expect(denied).toMatchObject({ phase: 'fallback', fallbackReason: 'denied' })
  })

  it('хук: тап «стоп» ставит причину ДО ctrl.stop()', () => {
    const hook = readFileSync(fileURLToPath(new URL('../../../features/player/panels/say-phrase/useSayPhrase.js', import.meta.url)), 'utf8')
    expect(hook).toMatch(/if \(plan\.act === 'stop'\) \{ dispatch\(\{ type: 'stop', reason: STOP_MANUAL \}\); ctrl\.stop\(\) \}/)
  })
})
