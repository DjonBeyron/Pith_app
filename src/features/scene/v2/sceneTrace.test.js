import { describe, it, expect, beforeEach } from 'vitest'
import { sceneTrace, sceneTraceLines, sceneTraceSeq, subscribeSceneTrace, resetSceneTrace, nextSceneTag, srcKind, audioState, shortText } from './sceneTrace.js'

describe('трасса сцены (sceneTrace.js)', () => {
  beforeEach(() => resetSceneTrace())

  it('строка с временем попадает в буфер, подписчик получает номер', () => {
    const got = []
    const off = subscribeSceneTrace(n => got.push(n))
    sceneTrace('тап → раскрыть')
    sceneTrace('свернуть: Esc')
    off()
    sceneTrace('после отписки')
    expect(sceneTraceLines()).toHaveLength(3)
    expect(sceneTraceLines()[0]).toMatch(/^\[\d+\.\d\d\] тап → раскрыть$/)
    expect(got).toEqual([1, 2])
    expect(sceneTraceSeq()).toBe(3)
  })

  it('буфер кольцевой: старые строки вытесняются, последняя остаётся', () => {
    for (let i = 0; i < 400; i++) sceneTrace(`строка ${i}`)
    const lines = sceneTraceLines()
    expect(lines.length).toBeLessThanOrEqual(240)
    expect(lines.at(-1)).toContain('строка 399')
  })

  it('упавший подписчик не роняет запись', () => {
    subscribeSceneTrace(() => { throw new Error('boom') })
    expect(() => sceneTrace('ok')).not.toThrow()
    expect(sceneTraceLines()).toHaveLength(1)
  })

  it('метки сцен растут: #1, #2 …', () => {
    const a = nextSceneTag(), b = nextSceneTag()
    expect(a).toMatch(/^#\d+$/)
    expect(Number(b.slice(1))).toBe(Number(a.slice(1)) + 1)
  })

  it('вид ссылки: blob / data / http с хвостом файла / пусто', () => {
    expect(srcKind('blob:https://x/123')).toBe('blob')
    expect(srcKind('data:audio/wav;base64,AAA')).toBe('data')
    expect(srcKind('https://media.example.com/scenes/abc/line-07.mp3')).toBe('http:line-07.mp3')
    expect(srcKind('')).toBe('—')
    expect(srcKind(null)).toBe('—')
  })

  it('состояние <audio> одной строкой, поля подделки могут отсутствовать', () => {
    expect(audioState(null)).toBe('нет элемента')
    expect(audioState({ muted: false, paused: true, readyState: 4, currentTime: 1.234, duration: 2.5, src: 'blob:x' }))
      .toBe('muted=false paused=true rs=4 t=1.23 dur=2.5 src=blob')
    expect(audioState({})).toBe('muted=false paused=true rs=? t=? dur=? src=—')
  })

  it('короткий текст реплики', () => {
    expect(shortText('  Hello   world ')).toBe('Hello world')
    expect(shortText('a'.repeat(40), 10)).toBe('aaaaaaaaa…')
  })
})
