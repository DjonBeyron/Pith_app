import { describe, it, expect } from 'vitest'
import { MARK_TAGS, buildMark, deviceLabel, marksSummary, tagEmoji, tagLabel } from './reviewMarks.js'

const node = { id: 'n1', seq: 7, type: 'text', typeData: { text: { content: '  Привет,   друг!  ' } } }

describe('пометки с телефона', () => {
  it('четыре тега, у каждого эмодзи и подпись', () => {
    expect(MARK_TAGS.map(t => t.id)).toEqual(['robotic', 'boring', 'unclear', 'great'])
    expect(tagEmoji('great')).toBe('👍')
    expect(tagLabel('robotic')).toBe('Роботизированно')
    expect(tagEmoji('x')).toBe('•')
  })

  it('buildMark: снимок ноды (текст в одну строку, ≤300), тег, комментарий без пробелов по краям, устройство', () => {
    const m = buildMark({ node, lessonId: 'L', tag: 'boring', comment: '  затянуто ', device: 'iPhone' })
    expect(m).toEqual({ lessonId: 'L', nodeId: 'n1', seq: 7, type: 'text', text: 'Привет, друг!', tag: 'boring', comment: 'затянуто', device: 'iPhone' })
    expect(buildMark({ node: { ...node, typeData: { text: { content: 'я'.repeat(500) } } }, tag: 'great', device: 'ПК' }).text).toHaveLength(300)
    expect(() => buildMark({ node, tag: 'meh' })).toThrow(/неизвестный тег/)
  })

  it('deviceLabel по user agent', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)')).toBe('iPhone')
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 11; SM-A505F)')).toBe('Android')
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0)')).toBe('ПК')
  })

  it('marksSummary: эмодзи в порядке тегов, счётчик при повторах', () => {
    expect(marksSummary([{ tag: 'great' }, { tag: 'robotic' }, { tag: 'robotic' }])).toBe('🤖×2 👍')
    expect(marksSummary([])).toBe('')
  })
})
