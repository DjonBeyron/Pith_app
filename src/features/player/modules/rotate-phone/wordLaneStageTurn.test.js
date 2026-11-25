import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { stageStill, stageTurn, PAUSED_NEXT_LOG } from './wordLaneStageTurn.js'
import { whenReady, END_CAP_MS } from '../../../pitrace/boss/examEndWait.js'
import { waitCircleSpeech, CIRCLE_WAIT_CAP_MS } from '../../../pitrace/mia/miaCircleEnd.js'
import { miaInit } from '../../../pitrace/mia/raceMia.js'

// Журнал владельца 2026-11-25 (iPhone, v3.3.365): попап «Комментарий к логам» открыт, игра на паузе (19:12:17.580 и 19:17:00.562), а через 41 с / 14 с сцена пошла сама — «Мия уходит», разворот конвейера, проход B,
// «[word-lane] микрофон не открылся: NotAllowedError» (плашка «Не получается слушать»). Причина — очереди конца стадии на своих таймерах зовут переход «дальше» и на паузе.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
afterEach(() => vi.useRealTimers())
const director = () => { const sRef = { current: { stage: 'run', idx: 5, at: 1000 } }; const next = vi.fn(() => { sRef.current = { stage: 'run', idx: sRef.current.idx + 1, at: sRef.current.at + 1 } }); return { sRef, next } }

describe('stageTurn: отложенный переход живёт, пока идёт его стадия', () => {
  it('stageStill: та же стадия и та же отметка времени, не пауза', () => {
    expect(stageStill({ stage: 'run', idx: 5, at: 1000 }, 5, 1000)).toBe(true)
    expect(stageStill({ stage: 'paused', from: 'run', idx: 5, at: 1000 }, 5, 1000)).toBe(false)
    expect(stageStill({ stage: 'run', idx: 5, at: 2000 }, 5, 1000)).toBe(false) // «Продолжить» / перезапуск ступени: стадия та же, запуск новый
    expect(stageStill({ stage: 'run', idx: 6, at: 1000 }, 5, 1000)).toBe(false)
    expect(stageStill(null, 5, 1000)).toBe(false)
  })
  it('стадия идёт — переход срабатывает', () => {
    const { sRef, next } = director(), log = vi.fn()
    stageTurn(sRef, 5, 1000, next, log)()
    expect(next).toHaveBeenCalledTimes(1); expect(log).not.toHaveBeenCalled()
  })
  it('ПРИЧИНА ИЗ ЖУРНАЛА: конец экзамена ждёт речь опросом (whenReady) — пауза его не снимает, по потолку он зовёт переход; со сверкой стадии игра стоит', () => {
    vi.useFakeTimers()
    const { sRef, next } = director(), log = vi.fn()
    whenReady({ ready: () => false, go: stageTurn(sRef, 5, 1000, next, log) }) // речь «не кончается»: на паузе очередь сброшена, уход Мии не наступит
    sRef.current = { stage: 'paused', from: 'run', idx: 5, at: 1000 } // попап комментария: f.pause('comment')
    vi.advanceTimersByTime(END_CAP_MS + 1000)
    expect(next).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0]).toMatch(/опоздавший переход стадии 5 отброшен: сейчас пауза/)
  })
  it('без сверки тот же опрос двигает игру прямо из паузы (так было)', () => {
    vi.useFakeTimers()
    const { sRef, next } = director()
    whenReady({ ready: () => false, go: next })
    sRef.current = { stage: 'paused', from: 'run', idx: 5, at: 1000 }
    vi.advanceTimersByTime(END_CAP_MS + 1000)
    expect(next).toHaveBeenCalledTimes(1); expect(sRef.current.stage).toBe('run') // пауза снята без «Продолжить»
  })
  it('то же с концом «Допроса» (waitCircleSpeech): очередь речи не пустеет — потолок 20 с зовёт переход, на паузе он пустой', () => {
    vi.useFakeTimers()
    const { sRef, next } = director()
    const st = { type: 'announce', act: 'sprint', sid: 'sprint3-end', mia: 'end' }
    waitCircleSpeech({ st, m: { ...miaInit(), phase: 'out', why: 'win' }, pending: () => 1, later: (fn, ms) => setTimeout(fn, ms), go: stageTurn(sRef, 5, 1000, next, () => {}) })
    sRef.current = { stage: 'paused', from: 'run', idx: 5, at: 1000 }
    vi.advanceTimersByTime(CIRCLE_WAIT_CAP_MS + 1000)
    expect(next).not.toHaveBeenCalled()
  })
  it('после «Продолжить» (новая отметка at) старая очередь не двигает игру второй раз, новая — двигает', () => {
    vi.useFakeTimers()
    const { sRef, next } = director()
    whenReady({ ready: () => false, go: stageTurn(sRef, 5, 1000, next, () => {}), cap: 5000 })
    sRef.current = { stage: 'paused', from: 'run', idx: 5, at: 1000 }
    vi.advanceTimersByTime(1000)
    sRef.current = { stage: 'run', idx: 5, at: 9000 } // restartStage
    whenReady({ ready: () => true, go: stageTurn(sRef, 5, 9000, next, () => {}), tail: 100, cap: 60000 })
    vi.advanceTimersByTime(10000) // старая очередь дошла до потолка уже после возобновления
    expect(next).toHaveBeenCalledTimes(1) // один переход, не два (иначе стадия перескакивала бы)
  })
})

describe('проводка: пауза держит сцену', () => {
  const flow = read('./useWordLaneFlow.js'), acts = read('../../../pitrace/useRaceActs.js')
  it('стадия-плашка отдаёт очереди переход со сверкой стадии; next() на паузе не идёт', () => {
    expect(flow).toContain('rh.afterCount(stageTurn(sRef, s.idx, s.at, next))')
    expect(flow).not.toContain('rh.afterCount(next)')
    expect(flow).toContain("if (sRef.current.stage === 'paused') { pLog(PAUSED_NEXT_LOG); return }")
    expect(PAUSED_NEXT_LOG).toMatch(/на паузе/)
  })
  it('машина Мии на паузе событий не принимает (сторож коробки, касания, bye), отложенный конец круга / экзамена снят', () => {
    expect(acts).toContain("pausedRef.current = stage === 'paused'; if (stage === 'paused') clearEndTimer(mb)")
    expect(acts).toContain('if (!miaOn() || pausedRef.current) return')
  })
  it('попап комментария ставит паузу, окно «Продолжить» возвращается после закрытия попапа', () => {
    const game = read('./WordLaneGame.jsx')
    expect(game).toContain("onOpen={() => f.pause('comment')}")
    expect(game).toContain('{f.paused && !comment && !hudOpen && <WordLanePause pause={pause} onExit={f.finish} />}')
  })
})
