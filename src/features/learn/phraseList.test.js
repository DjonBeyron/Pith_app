import { describe, it, expect } from 'vitest'
import { buildPhraseList, phraseDateLabel, PHRASE_LOST_TEXT } from './phraseList.js'

const mod = (id, title, words) => ({ id, title, videoUrl: null, words: words.map(w => ({ word: w, lessonId: 'l-' + w, lessonTitle: w })) })
const byWord = new Map([['keep', { step: 4, due_on: '2026-10-09' }], ['going', { step: 3, due_on: '2026-10-05' }]])
const rowOf = (module_id, consolidated_at, phrase_title = null, phrase_words = null) => ({ module_id, consolidated_at, phrase_title, phrase_words })

describe('список закреплённых фраз', () => {
  const modules = new Map([['m1', mod('m1', 'Keep going', ['keep', 'going'])], ['m2', mod('m2', 'Пустой модуль', [])]])
  const list = rows => buildPhraseList(rows, modules, byWord, w => w === 'keep')

  it('живая фраза: название и слова из модуля, слова с силой', () => {
    const [p] = list([rowOf('m1', '2026-09-30T10:00:00Z')])
    expect(p).toMatchObject({ id: 'm1', title: 'Keep going', lost: null })
    expect(p.words).toEqual([
      { word: 'keep', lessonId: 'l-keep', lessonTitle: 'keep', step: 4, due: '2026-10-09', hasDeck: true },
      { word: 'going', lessonId: 'l-going', lessonTitle: 'going', step: 3, due: '2026-10-05', hasDeck: false },
    ])
  })

  it('модуль пропал: фраза остаётся — название и слова из снимка, слова с силой из памяти', () => {
    const [p] = list([rowOf('gone-1', '2026-09-30T10:00:00Z', 'Old phrase', ['keep', 'zzz'])])
    expect(p).toMatchObject({ id: 'gone-1', title: 'Old phrase', lost: 'gone', videoUrl: null })
    expect(p.words.map(w => [w.word, w.step])).toEqual([['keep', 4], ['zzz', null]])
    expect(p.words[0].lessonId).toBeUndefined()
  })

  it('модуль есть, а слов-уроков не осталось — «closed», слова из снимка', () => {
    const [p] = list([rowOf('m2', '2026-09-30T10:00:00Z', null, ['going'])])
    expect(p).toMatchObject({ title: 'Пустой модуль', lost: 'closed' })
    expect(p.words.map(w => w.word)).toEqual(['going'])
  })

  it('снимка нет (старая запись, модуля нет) — не падает, название пустое', () => {
    const [p] = list([rowOf('x', null)])
    expect(p).toMatchObject({ title: '', lost: 'gone', date: null, words: [] })
  })

  it('свежие закрепления первыми; записи без module_id пропускаются', () => {
    const l = list([rowOf('m1', '2026-09-01T10:00:00Z'), rowOf('gone-1', '2026-09-30T10:00:00Z', 'B'), { consolidated_at: '2026-10-01T10:00:00Z' }])
    expect(l.map(p => p.id)).toEqual(['gone-1', 'm1'])
  })

  it('дата словами; не этого года — с годом', () => {
    expect(phraseDateLabel('2026-10-01', '2026-10-05')).toBe('1 окт')
    expect(phraseDateLabel('2025-12-24', '2026-10-05')).toBe('24 дек 2025')
    expect(phraseDateLabel(null, '2026-10-05')).toBe('')
  })

  it('заботливые тексты — для обоих случаев и без «ошибки»', () => {
    for (const k of ['gone', 'closed']) {
      expect(PHRASE_LOST_TEXT[k]).toMatch(/закреплённой/)
      expect(PHRASE_LOST_TEXT[k]).not.toMatch(/ошибк|не удалось/i)
    }
  })
})
