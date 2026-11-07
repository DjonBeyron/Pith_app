import { describe, it, expect, vi, beforeEach } from 'vitest'

// «Продолжить» после паузы в «Встряхни память»: ступень ученика гонки идёт с хода, на котором была пауза (сцена отдаёт его в pause — resumeAt),
// на плашке и в других играх («Повтори за диктором», репетиция) — с начала ступени, как раньше. Хуки React — «как есть» (как wordLanePause.test.js).
const logs = vi.hoisted(() => [])
vi.mock('react', async orig => ({ ...(await orig()), useCallback: fn => fn }))
vi.mock('react-dom', async orig => ({ ...(await orig()), flushSync: fn => fn() }))
vi.mock('./wordLaneVoice.js', () => ({ stopVoice: () => {} }))
vi.mock('./wordLaneNotes.js', () => ({ releaseNotes: () => {} }))
vi.mock('./wordLaneClips.js', () => ({ releaseClips: () => {} }))
vi.mock('./useGameAudioModes.js', () => ({ endGameAudio: () => {} }))
vi.mock('../../../../shared/lib/gameMic.js', () => ({ closeGameMic: () => {} }))
vi.mock('../../../../shared/lib/debug.js', () => ({ pLog: m => logs.push(m) }))

import { useWordLaneControls } from './useWordLaneControls.js'

beforeEach(() => { logs.length = 0 })

const reps = n => Array.from({ length: n }, (_, i) => ({ parts: [i] }))
const RACE = [{ idx: 0, type: 'announce', sid: 'sprint-ann', race: true }, { idx: 1, type: 'student', sid: 'sprint', race: true, step: { id: 'sprint', reps: reps(6) } }]
const REHEARSAL = [{ idx: 0, type: 'announce' }, { idx: 1, type: 'dictor', step: 'A' }, { idx: 2, type: 'student', step: 'A' }]

function make(stages, state, resumeAt) {
  const sRef = { current: state }
  const args = {
    stages, sRef, setS: vi.fn(fn => { sRef.current = fn(sRef.current) }), setMicEpoch: vi.fn(), clearTimers: vi.fn(),
    listenerRef: { current: null }, noteTimerRef: { current: 0 }, hintTimerRef: { current: 0 }, finishedRef: { current: false },
    catApi: { current: null }, cat: { stop: vi.fn() }, dbg: { event: vi.fn() }, sceneApi: { current: resumeAt == null ? null : { resumeAt: () => resumeAt } },
  }
  return { sRef, args, api: useWordLaneControls(args) }
}

describe('restartStage() из паузы: гонка — с текущего хода', () => {
  it('пауза на 2-м повторе прохода A → та же стадия, resume { at, n: 1 } с её отметкой времени, журнал «ход 2 из 6 (с текущего)»', () => {
    const c = make(RACE, { stage: 'run', idx: 1, at: 5 }, 1)
    c.api.pause('hidden')
    expect(c.sRef.current).toMatchObject({ stage: 'paused', rep: 1 })
    c.api.restartStage()
    const s = c.sRef.current
    expect(s).toMatchObject({ stage: 'run', idx: 1, resume: { n: 1 } })
    expect(s.resume.at).toBe(s.at)
    expect(logs).toContain('[pause] продолжить: ступень sprint, ход 2 из 6 (с текущего)')
  })
  it('пауза на первом ходе — с начала ступени, resume нет', () => {
    const c = make(RACE, { stage: 'run', idx: 1, at: 5 }, 0)
    c.api.pause(); c.api.restartStage()
    expect(c.sRef.current).toMatchObject({ stage: 'run', idx: 1, resume: null })
    expect(logs).toContain('[pause] продолжить: ступень sprint, ход 1 из 6 (с начала)')
  })
  it('пауза на плашке — плашка заново, как раньше (с первого хода ступени)', () => {
    const c = make(RACE, { stage: 'run', idx: 0, at: 5 }, null)
    c.api.pause(); c.api.restartStage()
    expect(c.sRef.current).toMatchObject({ stage: 'run', idx: 0, resume: null })
    expect(logs).toContain('[pause] продолжить: ступень sprint-ann, ход 1 из 6 (с начала)')
  })
  it('HUD «Перезапустить ступень» без паузы — с начала ступени', () => {
    const c = make(RACE, { stage: 'run', idx: 1, at: 5, rep: 3 }, 3)
    c.api.restartStage()
    expect(c.sRef.current).toMatchObject({ stage: 'run', idx: 1, resume: null })
  })
})

describe('restartStage() из паузы: другие игры — как раньше', () => {
  it('«Повтори за диктором» / репетиция: с начала ступени (диктор), даже если сцена отдала ход', () => {
    const c = make(REHEARSAL, { stage: 'run', idx: 2, at: 5 }, 2)
    c.api.pause(); c.api.restartStage()
    expect(c.sRef.current).toMatchObject({ stage: 'run', idx: 1, resume: null })
    expect(logs.some(l => l.includes('(с начала)'))).toBe(true)
  })
  it('без sceneApi (старые вызовы) — с начала ступени', () => {
    const c = make(RACE, { stage: 'run', idx: 1, at: 5 })
    delete c.args.sceneApi
    const api = useWordLaneControls(c.args)
    api.pause(); api.restartStage()
    expect(c.sRef.current).toMatchObject({ stage: 'run', idx: 1, resume: null })
  })
})
