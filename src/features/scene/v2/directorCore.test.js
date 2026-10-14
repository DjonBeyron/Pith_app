import { describe, it, expect, vi } from 'vitest'
import { createDirector } from './directorCore.js'

// Ручной «проигрыватель»: реплика заканчивается только по finish()
function makePlayer() {
  const log = []
  let pending = null
  const playLine = vi.fn((line, index, { onEnd }) => {
    log.push(`start:${index}:${line.who}`)
    pending = onEnd
    return () => { log.push(`cancel:${index}`); pending = null }
  })
  return { playLine, log, finish: () => { const f = pending; pending = null; f?.() } }
}

const timeline = [
  { who: 'a', text: 'Раз.' },
  { who: 'b', text: 'Два.' },
  { who: 'a', text: 'Три.' },
]

describe('directorCore', () => {
  it('порядок реплик: play → реплики по очереди → ended', () => {
    const p = makePlayer()
    const states = []
    const d = createDirector({ timeline, playLine: p.playLine, onChange: s => states.push(`${s.status}:${s.index}`) })
    expect(d.getState()).toMatchObject({ index: 0, status: 'idle', total: 3 })
    d.play()
    p.finish()
    p.finish()
    p.finish()
    expect(p.log).toEqual(['start:0:a', 'start:1:b', 'start:2:a'])
    expect(d.getState().status).toBe('ended')
    expect(states.at(-1)).toBe('ended:2')
    // Повторный play после конца — с начала
    d.play()
    expect(p.log.at(-1)).toBe('start:0:a')
  })

  it('пауза отменяет реплику, продолжение начинает её заново; toggle', () => {
    const p = makePlayer()
    const d = createDirector({ timeline, playLine: p.playLine })
    d.play()
    p.finish()
    d.pause()
    expect(p.log).toEqual(['start:0:a', 'start:1:b', 'cancel:1'])
    expect(d.getState()).toMatchObject({ status: 'paused', index: 1 })
    d.toggle()
    expect(p.log.at(-1)).toBe('start:1:b')
    d.toggle()
    expect(d.getState().status).toBe('paused')
    d.pause() // повторная пауза — ничего
    expect(p.log.filter(x => x.startsWith('cancel')).length).toBe(2)
  })

  it('restart всегда с нуля, в том числе из ended и из середины', () => {
    const p = makePlayer()
    const d = createDirector({ timeline, playLine: p.playLine })
    d.play()
    p.finish()
    d.restart()
    expect(p.log.slice(-2)).toEqual(['cancel:1', 'start:0:a'])
    p.finish(); p.finish(); p.finish()
    expect(d.getState().status).toBe('ended')
    d.restart()
    expect(d.getState()).toMatchObject({ status: 'playing', index: 0 })
  })

  it('поздний onEnd отменённой реплики не двигает сцену', () => {
    const p = makePlayer()
    const d = createDirector({ timeline, playLine: p.playLine })
    d.play()
    const lateEnd = p.playLine.mock.calls[0][2].onEnd
    d.pause()
    lateEnd()
    expect(d.getState()).toMatchObject({ status: 'paused', index: 0 })
    d.play()
    lateEnd() // от старого запуска (run отличается) — игнор
    expect(d.getState().index).toBe(0)
  })

  it('goTo: на паузе — только индекс, в игре — перезапуск реплики; за границы — игнор', () => {
    const p = makePlayer()
    const d = createDirector({ timeline, playLine: p.playLine })
    d.goTo(2)
    expect(d.getState()).toMatchObject({ status: 'idle', index: 2 })
    expect(p.log).toEqual([])
    d.play()
    d.goTo(1)
    expect(p.log.slice(-2)).toEqual(['cancel:2', 'start:1:b'])
    d.goTo(7)
    expect(d.getState().index).toBe(1)
  })

  it('loop: после последней — снова первая; destroy отменяет и глушит onChange', () => {
    const p = makePlayer()
    const onChange = vi.fn()
    const d = createDirector({ timeline, playLine: p.playLine, loop: true, onChange })
    d.play()
    p.finish(); p.finish(); p.finish()
    expect(p.log.at(-1)).toBe('start:0:a')
    expect(d.getState().status).toBe('playing')
    const calls = onChange.mock.calls.length
    d.destroy()
    expect(p.log.at(-1)).toBe('cancel:0')
    d.play()
    expect(onChange.mock.calls.length).toBe(calls)
  })

  it('пустой timeline: play сразу ended', () => {
    const d = createDirector({ timeline: [], playLine: vi.fn() })
    d.play()
    expect(d.getState().status).toBe('ended')
  })
})
