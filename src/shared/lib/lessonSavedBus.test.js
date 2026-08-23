import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { onLessonSaved, notifyLessonSaved } from './lessonSavedBus.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('оповещение «урок сохранён»', () => {
  it('подписчики получают новое название', () => {
    const seen = []
    const off = onLessonSaved(l => seen.push(l))
    notifyLessonSaved({ id: 'l1', title: 'Новое имя', lessonXp: 30 })
    off()
    notifyLessonSaved({ id: 'l1', title: 'После отписки' })
    expect(seen).toEqual([{ id: 'l1', title: 'Новое имя', lessonXp: 30 }])
  })

  it('урок без id не рассылается', () => {
    const fn = vi.fn()
    const off = onLessonSaved(fn)
    notifyLessonSaved(null)
    notifyLessonSaved({ title: 'без id' })
    off()
    expect(fn).not.toHaveBeenCalled()
  })

  it('упавший подписчик не мешает остальным', () => {
    const ok = vi.fn()
    const offBad = onLessonSaved(() => { throw new Error('сломался') })
    const offOk = onLessonSaved(ok)
    notifyLessonSaved({ id: 'l1', title: 'Имя' })
    offBad(); offOk()
    expect(ok).toHaveBeenCalledTimes(1)
  })
})

describe('редакторы и список уроков связаны', () => {
  it('оба редактора сообщают о сохранении', () => {
    expect(read('../../features/canvas/CanvasPage.jsx'))
      .toContain('notifyLessonSaved({ id: lessonId, title, lessonXp })')
    expect(read('../../features/production/ProductionPage.jsx'))
      .toContain('notifyLessonSaved({ id: lessonId, title')
  })

  it('схема модуля правит название у себя, без запроса в базу', () => {
    const hook = read('../../features/lessons/useCurriculumLessons.js')
    expect(hook).toContain('useEffect(() => onLessonSaved(saved => {')
    expect(hook).toContain('title: saved.title ?? l.title')
  })
})
