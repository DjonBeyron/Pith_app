import { describe, it, expect } from 'vitest'
import { buildPhraseList, buildStartedPhrases, phraseDateLabel, PHRASE_LOST_TEXT } from './phraseList.js'

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
      { word: 'keep', lessonId: 'l-keep', lessonTitle: 'keep', step: 4, due: '2026-10-09', hasDeck: true, perm: false },
      { word: 'going', lessonId: 'l-going', lessonTitle: 'going', step: 3, due: '2026-10-05', hasDeck: false, perm: false },
    ])
  })

  it('слово постоянной памяти (settled_on) помечено perm — и в живой фразе, и в снимке', () => {
    const settled = new Map([['keep', { step: 5, due_on: '2026-12-01', settled_on: '2026-10-01' }], ['going', { step: 3, due_on: '2026-10-05' }]])
    const live = buildPhraseList([rowOf('m1', '2026-09-30T10:00:00Z')], modules, settled, () => true)[0]
    expect(live.words.map(w => [w.word, w.perm])).toEqual([['keep', true], ['going', false]])
    const lost = buildPhraseList([rowOf('gone-1', '2026-09-30T10:00:00Z', 'Old', ['keep', 'zzz'])], modules, settled, () => true)[0]
    expect(lost.words.map(w => [w.word, w.perm])).toEqual([['keep', true], ['zzz', false]])
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

  it('свежие выученные первыми; записи без module_id пропускаются; номер — по порядку выучивания', () => {
    const l = list([rowOf('m1', '2026-09-01T10:00:00Z'), rowOf('gone-1', '2026-09-30T10:00:00Z', 'B'), { consolidated_at: '2026-10-01T10:00:00Z' }])
    expect(l.map(p => p.id)).toEqual(['gone-1', 'm1'])
    expect(l.map(p => p.n)).toEqual([2, 1]) // первая выученная — №1, новая получает следующий номер
  })

  it('дата словами; не этого года — с годом', () => {
    expect(phraseDateLabel('2026-10-01', '2026-10-05')).toBe('1 окт')
    expect(phraseDateLabel('2025-12-24', '2026-10-05')).toBe('24 дек 2025')
    expect(phraseDateLabel(null, '2026-10-05')).toBe('')
  })

  it('заботливые тексты — для обоих случаев и без «ошибки»', () => {
    for (const k of ['gone', 'closed']) {
      expect(PHRASE_LOST_TEXT[k]).toMatch(/коллекции выученных/)
      expect(PHRASE_LOST_TEXT[k]).not.toMatch(/ошибк|не удалось/i)
    }
  })
})

describe('«Мои начатые фразы»', () => {
  const cur = [
    { id: 'a', title: 'Alpha', video_url: 'v.mp4', lesson_ids: ['a1', 'a2', 'a3', 'a4'] },
    { id: 'b', title: 'Beta', lesson_ids: ['b1', 'b2'] },
    { id: 'c', title: 'Gamma', lesson_ids: ['c1', 'c2'] },
    { id: 'd', title: 'Delta', lesson_ids: [] },
  ]

  it('начат (в списке начатых или есть пройденный урок), но не 100%; ближние к концу первыми', () => {
    const list = buildStartedPhrases(cur, new Set(['c']), new Set(['a1', 'a2', 'a3', 'b1', 'b2']))
    expect(list.map(p => [p.id, p.done, p.total, p.pct])).toEqual([['a', 3, 4, 75], ['c', 0, 2, 0]])
    expect(list[0]).toMatchObject({ title: 'Alpha', videoUrl: 'v.mp4' })
  })

  it('пройден на 100% — не в списке; ни начат, ни пройден — тоже; модуль без уроков — нет', () => {
    expect(buildStartedPhrases(cur, new Set(), new Set(['b1', 'b2']))).toEqual([])
    expect(buildStartedPhrases(cur, new Set(), new Set())).toEqual([])
    expect(buildStartedPhrases(null, new Set(), new Set())).toEqual([])
  })
})
