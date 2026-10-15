import { describe, it, expect } from 'vitest'
import * as ts from './sceneTaskState.js'
import * as vs from './sceneVoiceState.js'

const opened = () => ts.open(ts.initialTask('s1'), 1000)

describe('sceneVoiceState — idle → ready → listening → checked → closed', () => {
  it('открытие, запись, верный ответ → вердикт, закрытие', () => {
    let s = ts.initialTask('s1')
    expect(vs.listen(s)).toBe(s) // до открытия микрофон «мёртв»
    s = ts.open(s, 1000)
    expect(s.phase).toBe('ready')
    s = vs.listen(s)
    expect(s.phase).toBe('listening')
    expect(ts.isOpen(s)).toBe(true)
    s = vs.pass(s, { heard: 'I like tea' })
    expect(s).toMatchObject({ phase: 'checked', ok: true, attempt: 1, heard: 'I like tea' })
    expect(ts.close(s).phase).toBe('closed')
  })
  it('две попытки: первая неверная → снова ready с «Не совсем», вторая → вердикт', () => {
    let s = vs.listen(opened())
    s = vs.fail(s, { heard: 'banana', spoke: true })
    expect(s).toMatchObject({ phase: 'ready', attempt: 1, wrong: true, note: vs.NOTE_WRONG, heard: 'banana' })
    s = vs.fail(vs.listen(s), { heard: 'apple', spoke: true })
    expect(s).toMatchObject({ phase: 'checked', ok: false, attempt: 2, heard: 'apple' })
  })
  it('тишина попытку не тратит, три тишины подряд = одна; ошибка движка не тратит', () => {
    let s = opened()
    for (let i = 0; i < 2; i++) s = vs.fail(vs.listen(s), { quiet: true })
    expect(s).toMatchObject({ phase: 'ready', attempt: 0, silences: 2, note: vs.NOTE_QUIET })
    s = vs.fail(vs.listen(s), { quiet: true })
    expect(s).toMatchObject({ attempt: 1, silences: 0, phase: 'ready' })
    s = vs.fail(vs.listen(s), { spoke: false, quiet: false })
    expect(s).toMatchObject({ attempt: 1, note: vs.NOTE_ERROR, phase: 'ready' })
  })
  it('запись прервана — назад в ready, попытка не потрачена; итог вне записи игнорируется', () => {
    const s = vs.unlisten(vs.listen(opened()))
    expect(s.phase).toBe('ready')
    expect(s.attempt).toBe(0)
    expect(vs.pass(ts.initialTask('x'), { heard: 'a' }).phase).toBe('idle')
    const done = vs.pass(vs.listen(opened()), { heard: 'a' })
    expect(vs.fail(done, { spoke: true })).toBe(done)
  })
  it('«Не могу говорить» / «Спроси позже» — просто close, штрафов нет', () => {
    const s = ts.close(vs.listen(opened()))
    expect(s.phase).toBe('closed')
    expect(ts.isOpen(s)).toBe(false)
  })
  it('failKind: распознано / тишина / ошибка; события плоские без транскрипта', () => {
    expect(vs.failKind({ verdict: { heard: 'x' } })).toEqual({ spoke: true, quiet: false })
    expect(vs.failKind({ verdict: { heard: '' } })).toEqual({ spoke: false, quiet: true })
    expect(vs.failKind({ errorCode: 'no-speech' })).toEqual({ spoke: false, quiet: true })
    expect(vs.failKind({ errorCode: 'audio-capture' })).toEqual({ spoke: false, quiet: false })
    const next = vs.pass(vs.listen(opened()), { heard: 'secret words' })
    const props = vs.voiceAnswerProps({ sceneId: 's1', kind: 'repeat', next, openedAt: 1000, engine: 'vosk', now: 3500 })
    expect(props).toEqual({ scene_id: 's1', kind: 'repeat', ok: true, attempt: 1, ms: 2500, engine: 'vosk' })
    expect(JSON.stringify(props)).not.toContain('secret')
    expect(vs.voiceAnswerProps({ sceneId: 's', kind: 'say', next, openedAt: 0, engine: null, now: 1 }).engine).toBe('system')
    expect(vs.countedAnswer({ ok: false, spoke: false }, { phase: 'ready' })).toBe(false)
    expect(vs.countedAnswer({ ok: false, spoke: true }, { phase: 'ready' })).toBe(true)
  })
})
