import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setLastEditedLesson, getLastEditedLesson, clearLastEditedLesson } from '../lib/lastEditedLesson.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

describe('память о последнем редактируемом уроке', () => {
  it('сохраняет урок и переживает перезагрузку (localStorage)', () => {
    setLastEditedLesson({ id: 'l1', title: '  Старт  ' })
    expect(getLastEditedLesson()).toMatchObject({ id: 'l1', title: 'Старт' })
    expect(typeof getLastEditedLesson().at).toBe('number')
  })

  it('пустой урок не запоминается, мусор в хранилище не роняет чтение', () => {
    setLastEditedLesson(null)
    setLastEditedLesson({ title: 'без id' })
    expect(getLastEditedLesson()).toBe(null)
    localStorage.setItem('pithy_last_edited_lesson', '{битый json')
    expect(getLastEditedLesson()).toBe(null)
  })

  it('очистка стирает запись', () => {
    setLastEditedLesson({ id: 'l1', title: 'Старт' })
    clearLastEditedLesson()
    expect(getLastEditedLesson()).toBe(null)
  })
})

describe('всплывашка «продолжить редактирование»', () => {
  const toast = read('./ResumeEditingToast.jsx')

  it('исчезает сама, если её не трогать', () => {
    expect(toast).toContain('const HIDE_AFTER_MS = 12000')
    expect(toast).toContain('setTimeout(() => setClosing(true), HIDE_AFTER_MS)')
  })

  it('кнопка ведёт в урок, крестик просто закрывает', () => {
    expect(toast).toContain('onOpen(lesson)')
    expect(toast).toContain('onClick={() => setClosing(true)}>✕')
  })

  it('показывается только админу и только когда редактор закрыт', () => {
    const shell = read('../../app/ShellV2.jsx')
    expect(shell).toContain('{isAdmin && !canvasLesson && !productionLesson && (')
    expect(shell).toContain('setCanvasLesson({ id: lesson.id, moduleLessons: [] })')
  })

  it('урок запоминается при открытии канваса', () => {
    const page = read('../../features/canvas/CanvasPage.jsx')
    expect(page).toContain('setLastEditedLesson({ id: lessonId, title: data?.title })')
  })
})
