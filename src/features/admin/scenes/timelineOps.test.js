import { describe, it, expect } from 'vitest'
import { addLine, removeLine, moveLine, updateLine, duplicateLine, audioStatus, charsLeft, MAX_LINES } from './timelineOps.js'

const tl = () => [
  { who: 'a', text: 'Один.', emotion: 'neutral', pose: 'talk' },
  { who: 'b', text: 'Два.', emotion: 'happy', pose: 'talk' },
  { who: 'a', text: 'Три.', emotion: 'tired', pose: 'lean' },
]

describe('таймлайн реплик', () => {
  it('addLine: в конец чередует говорящего; после индекса — вставка', () => {
    const t = addLine(tl())
    expect(t).toHaveLength(4)
    expect(t[3]).toEqual({ who: 'b', text: '', emotion: 'neutral', pose: 'talk' })
    const mid = addLine(tl(), 0)
    expect(mid[1].who).toBe('b')
    expect(mid[2].text).toBe('Два.')
    expect(addLine([])[0].who).toBe('a')
    const full = Array.from({ length: MAX_LINES }, () => tl()[0])
    expect(addLine(full)).toBe(full)
  })

  it('removeLine / moveLine / duplicateLine', () => {
    expect(removeLine(tl(), 1).map(l => l.text)).toEqual(['Один.', 'Три.'])
    expect(removeLine(tl(), 9)).toHaveLength(3)
    expect(moveLine(tl(), 0, -1).map(l => l.text)).toEqual(['Один.', 'Два.', 'Три.'])
    expect(moveLine(tl(), 0, 1).map(l => l.text)).toEqual(['Два.', 'Один.', 'Три.'])
    expect(moveLine(tl(), 2, 1).map(l => l.text)).toEqual(['Один.', 'Два.', 'Три.'])
    const d = duplicateLine(tl(), 1)
    expect(d).toHaveLength(4)
    expect(d[2]).toEqual(d[1])
    expect(d[2]).not.toBe(d[1])
  })

  it('updateLine: словарные поля, обрезка текста, пустые необязательные удаляются', () => {
    const src = tl()
    const t = updateLine(src, 0, { who: 'b', emotion: 'surprised', pose: 'idle', text: 'x'.repeat(200), translation: ' hi ', audioUrl: '' })
    expect(src[0].who).toBe('a')
    expect(t[0].who).toBe('b')
    expect(t[0].emotion).toBe('surprised')
    expect(t[0].pose).toBe('idle')
    expect(t[0].text).toHaveLength(140)
    expect(t[0].translation).toBe('hi')
    expect(t[0].audioUrl).toBeUndefined()
    const bad = updateLine(src, 0, { who: 'c', emotion: 'angry', pose: 'fly' })
    expect(bad[0]).toEqual(src[0])
    const cleared = updateLine(t, 0, { translation: '' })
    expect(cleared[0].translation).toBeUndefined()
    expect(updateLine(src, 7, { text: 'x' })).toBe(src)
  })

  it('audioStatus и charsLeft', () => {
    expect(audioStatus({ text: 'x' })).toBe('none')
    expect(audioStatus({ audioUrl: 'https://a/b.mp3' })).toBe('file')
    expect(audioStatus({ audioUrl: 'https://a/b.mp3', wordTimings: [{ start: 0, end: 1 }] })).toBe('timed')
    expect(charsLeft('abc ')).toBe(137)
    expect(charsLeft('x'.repeat(150))).toBe(-10)
  })
})
