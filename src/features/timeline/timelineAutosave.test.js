import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createAutosave } from './timelineAutosave.js'
import { createSceneTrace } from '../../shared/lib/sceneTrace.js'
import { isFinished, packRun } from './timelineStore.js'

const make = (o = {}) => {
  const trace = createSceneTrace({ log: () => {}, clock: () => 1700000000000 }), saved = [], later = [], lines = []
  const auto = createAutosave({ trace, save: r => { saved.push(r); return o.save ? o.save(r) : new Promise(() => {}) }, log: s => lines.push(s), defer: fn => later.push(fn), pack: r => packRun(r, { now: new Date('2026-11-22T10:00:00Z'), device: 'iPhone 390×844', appVersion: '3.3.339' }) })
  const play = (finish = true) => { trace.begin({ game: 'race', stages: 3 }); trace.push('stage-in', { idx: 0, sid: 'sprint-ann', type: 'announce' }); trace.push('line-start', { who: 'pit', id: 'a', text: 'привет' }); if (finish) trace.push('stage-in', { idx: 2, sid: 'summary', type: 'summary' }) }
  return { trace, auto, saved, later, lines, play, flush: () => later.splice(0).forEach(fn => fn()) }
}

describe('автосохранение таймлайна на сервер', () => {
  it('админ доиграл: одно сохранение на событие end; повторный end того же прохождения — не второй раз; новое прохождение — снова одно', () => {
    const x = make(); x.auto.setAdmin(true); x.play()
    expect(x.saved).toHaveLength(0)
    x.trace.push('end', {}); x.trace.push('end', {}); x.flush()
    expect(x.saved).toHaveLength(1)
    expect(x.saved[0]).toMatchObject({ device: 'iPhone 390×844', appVersion: '3.3.339', savedAt: '2026-11-22T10:00:00.000Z', meta: { game: 'race', stages: 3 }, dropped: 0 })
    expect(x.saved[0].events.map(e => e.k)).toEqual(['run', 'stage-in', 'line-start', 'stage-in', 'end', 'end'])
    x.play(); x.trace.push('end', {}); x.flush(); expect(x.saved).toHaveLength(2); expect(x.saved[1].id).not.toBe(x.saved[0].id)
  })

  it('не ждёт ответа и не мешает игре: push("end") возвращается сразу — упаковка и сеть отложены; сервер не отвечает или падает — ничего не бросается', () => {
    const x = make(); x.auto.setAdmin(true); x.play()
    expect(x.trace.push('end', {})).toMatchObject({ k: 'end' }) // сохранение ещё даже не начато
    expect(x.saved).toHaveLength(0); expect(x.later).toHaveLength(1)
    expect(() => x.flush()).not.toThrow(); expect(x.saved).toHaveLength(1) // обещание сервера так и не выполнилось — никто его не ждёт
    const bad = make({ save: () => { throw new Error('упало') } }); bad.auto.setAdmin(true); bad.play(); bad.trace.push('end', {})
    expect(() => bad.flush()).not.toThrow(); expect(bad.lines.join()).toContain('автосохранение не запустилось: упало')
    const rej = make({ save: () => Promise.reject(new Error('сеть')) }); rej.auto.setAdmin(true); rej.play(); rej.trace.push('end', {}); expect(() => rej.flush()).not.toThrow()
  })

  it('не админ — подписки нет: ничего не сохраняется и не пробуется; админ вышел — подписка снята', () => {
    const x = make(); x.play(); x.trace.push('end', {}); x.flush()
    expect(x.saved).toHaveLength(0); expect(x.later).toHaveLength(0); expect(x.auto.active()).toBe(false)
    x.auto.setAdmin(true); x.auto.setAdmin(true); expect(x.auto.active()).toBe(true)
    x.auto.setAdmin(false); x.play(); x.trace.push('end', {}); x.flush(); expect(x.saved).toHaveLength(0)
  })

  it('игра не доиграна (вышел до итога) — автосохранения нет, в журнале причина', () => {
    const x = make(); x.auto.setAdmin(true); x.play(false); x.trace.push('end', {}); x.flush()
    expect(x.saved).toHaveLength(0); expect(x.lines.join()).toContain('игра закрыта до итога')
  })

  it('isFinished: итог или последняя стадия списка (один раунд — итога нет); без end — не доиграна', () => {
    const ev = (...list) => ({ meta: { stages: 4 }, events: list })
    expect(isFinished(ev({ k: 'stage-in', idx: 1, type: 'summary' }, { k: 'end' }))).toBe(true)
    expect(isFinished(ev({ k: 'stage-in', idx: 3, type: 'announce' }, { k: 'end' }))).toBe(true)
    expect(isFinished(ev({ k: 'stage-in', idx: 2, type: 'student' }, { k: 'end' }))).toBe(false)
    expect(isFinished(ev({ k: 'stage-in', idx: 3, type: 'summary' }))).toBe(false); expect(isFinished(null)).toBe(false)
  })

  it('игровой код о сервере не знает: в игре нет ни автосохранения, ни API таймлайна; включается из App.jsx настоящим статусом админа', () => {
    const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
    for (const f of ['../player/modules/rotate-phone/useWordLaneFlow.js', '../player/modules/rotate-phone/wordLaneSceneTrace.js']) expect(read(f)).not.toMatch(/timelineApi|timelineAutosave|\.onEnd\(/)
    expect(read('../../app/App.jsx')).toContain('useTimelineAutosave(isRealAdmin)')
    expect(read('./timelineAutosave.js')).not.toMatch(/await /)
  })
})
