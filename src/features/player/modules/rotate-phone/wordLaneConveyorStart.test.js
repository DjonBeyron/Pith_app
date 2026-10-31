import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { igniteAtMs, armedLanes } from './wordLaneConveyorStart.js'
import { CONVEYOR_LEAD_MS } from './wordLaneConveyor.js'
import { RUN_NONE } from './wordLaneRunLanes.js'
import { plateCueMs } from '../../../rehearsal/rehearsalConveyorCue.js'
import { stageTiming, countdownPlan, QUIET_RISE_MS } from '../../../rehearsal/rehearsalCountdown.js'

// Момент «старт конвейера» — один источник для репетиции и для обычной ноды (v3.3.85)
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('igniteAtMs: за CONVEYOR_LEAD_MS (≈ 40 кадров) до конца сигнала', () => {
  it('обычная нода: сигнала нет — берётся конец плашки', () => {
    expect(igniteAtMs({ holdMs: 1700 })).toBe(1700 - CONVEYOR_LEAD_MS)
    expect(igniteAtMs({ holdMs: 1500, cueMs: null })).toBe(1500 - CONVEYOR_LEAD_MS)
  })
  it('репетиция: конец реплики Пита раньше конца плашки — зажигание от реплики', () => {
    expect(igniteAtMs({ holdMs: 4000, cueMs: 2500 })).toBe(2500 - CONVEYOR_LEAD_MS)
  })
  it('сигнал не позже конца плашки; короткая плашка — зажигание сразу (не отрицательное время)', () => {
    expect(igniteAtMs({ holdMs: 2000, cueMs: 9000 })).toBe(2000 - CONVEYOR_LEAD_MS)
    expect(igniteAtMs({ holdMs: 300, cueMs: 200 })).toBe(0)
  })
  it('запас — около 40 кадров (0,65 с)', () => {
    expect(CONVEYOR_LEAD_MS).toBeGreaterThanOrEqual(640)
    expect(CONVEYOR_LEAD_MS).toBeLessThanOrEqual(680)
  })
})

describe('plateCueMs: конец сигнала перед пилюлями на плашке репетиции', () => {
  const timing = stageTiming({ order: null, lead: 250, busyMs: 0, lineMs: 2000, pause: 600, minMs: 1700, hasLine: true, quiet: true })
  it('озвученная реплика: конец речи = lineAt + подъём головы Пита + длина реплики', () => {
    expect(plateCueMs({ timing, lineMs: 2000, voiced: true })).toBe(timing.lineAt + QUIET_RISE_MS + 2000)
  })
  it('неозвученная реплика или её нет — сигнала нет (null): конвейер идёт от конца плашки', () => {
    expect(plateCueMs({ timing, lineMs: 2000, voiced: false })).toBe(null)
    expect(plateCueMs({ timing: stageTiming({ minMs: 1700, hasLine: false }), voiced: false })).toBe(null)
  })
  it('отсчёт «после» (разминка): сигнал — конец третьей ноты', () => {
    const t = stageTiming({ order: 'after', lead: 250, busyMs: 0, lineMs: 2000, pause: 600, minMs: 1700, hasLine: true, quiet: true })
    const last = countdownPlan().at(-1)
    expect(plateCueMs({ order: 'after', timing: t, lineMs: 2000, voiced: true })).toBe(t.countAt + last.at + last.ms)
  })
  it('отсчёт «до» (дубль): сигнал — конец реплики «поехали», она после нот', () => {
    const t = stageTiming({ order: 'before', lead: 250, busyMs: 0, lineMs: 1500, pause: 600, minMs: 1700, hasLine: true, quiet: true })
    expect(plateCueMs({ order: 'before', timing: t, lineMs: 1500, voiced: true })).toBe(t.lineAt + QUIET_RISE_MS + 1500)
  })
  it('зажигание всегда раньше смены стадии и не раньше нуля — для всех раскладок директора', () => {
    for (const order of [null, 'before', 'after']) {
      for (const quiet of [false, true]) {
        const t = stageTiming({ order, lead: 250, busyMs: 400, lineMs: 1800, pause: 600, minMs: 1700, hasLine: true, quiet })
        const at = igniteAtMs({ holdMs: t.holdMs, cueMs: plateCueMs({ order, timing: t, lineMs: 1800, voiced: quiet }) })
        expect(at).toBeGreaterThanOrEqual(0)
        expect(at).toBeLessThan(t.holdMs)
      }
    }
  })
})

describe('armedLanes: какие дорожки взведены', () => {
  const dictor = { type: 'dictor', step: { active: [0, 2] } }
  const student = { type: 'student', step: { active: [1] } }
  it('стадия с пилюлями — её дорожки, сразу', () => {
    expect(armedLanes({ stageObj: dictor })).toBe('101')
    expect(armedLanes({ stageObj: student, nextStage: dictor, ignited: true })).toBe('010')
  })
  it('плашка до момента зажигания — ни одной; после — дорожки следующей стадии', () => {
    for (const type of ['announce', 'turn']) {
      expect(armedLanes({ stageObj: { type }, nextStage: dictor, ignited: false })).toBe(RUN_NONE)
      expect(armedLanes({ stageObj: { type }, nextStage: dictor, ignited: true })).toBe('101')
    }
  })
  it('следующей стадии с пилюлями нет (зеркало, итог, конец) или это не плашка — ни одной', () => {
    expect(armedLanes({ stageObj: { type: 'announce' }, nextStage: { type: 'mirror' }, ignited: true })).toBe(RUN_NONE)
    expect(armedLanes({ stageObj: { type: 'announce' }, nextStage: null, ignited: true })).toBe(RUN_NONE)
    expect(armedLanes({ stageObj: null, nextStage: dictor, ignited: true })).toBe(RUN_NONE)
    expect(armedLanes({ stageObj: { type: 'mirror' }, nextStage: dictor, ignited: true })).toBe(RUN_NONE)
  })
})

describe('подключение', () => {
  it('директор репетиции отдаёт cueMs из того же plateCueMs, что проверен выше; хук useConveyorArm берёт holdMs и cueMs директора', () => {
    const acts = read('../../../rehearsal/useRehearsalActs.js')
    expect(acts).toContain("import { plateCueMs } from './rehearsalConveyorCue.js'")
    expect(acts).toMatch(/cueMs: st => \(on && \(st\?\.line \|\| st\?\.count\) \? plateCueMs\(/)
    const hook = read('./useConveyorArm.js')
    expect(hook).toContain('igniteAtMs({ holdMs: rh.holdMs(stageObj), cueMs: rh.cueMs(stageObj) })')
    expect(hook).toContain('clearTimeout(t)')
  })
  it('игра берёт взведённые дорожки из useConveyorArm и отдаёт паузу в WordLanePills', () => {
    const game = read('./WordLaneGame.jsx')
    expect(game).toContain('useConveyorArm(f)')
    expect(game).toContain('armed={armed} paused={f.paused}')
    expect(read('./useWordLaneFlow.js')).toMatch(/return \{ \.\.\.s, stages,/)
  })
})
