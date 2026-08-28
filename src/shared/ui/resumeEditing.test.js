import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setLastEditedLesson, getLastEditedLesson, clearLastEditedLesson, updateLastEditedModule } from '../lib/lastEditedLesson.js'

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
  it('запоминает модуль урока — «назад» из канваса ведёт в его схему', () => {
    setLastEditedLesson({ id: 'l1', title: 'Старт', module: { id: 'm1', title: 'Модуль' } })
    expect(getLastEditedLesson().module).toMatchObject({ id: 'm1', title: 'Модуль' })
    setLastEditedLesson({ id: 'l2', title: 'Без модуля' })
    expect(getLastEditedLesson().module).toBe(null)
  })

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

  // Старые записи (и заход мимо схемы модуля) модуля не содержат — редактор
  // находит его сам по lesson_ids и дописывает сюда
  it('модуль дописывается к уже сохранённой записи', () => {
    setLastEditedLesson({ id: 'l1', title: 'Старт' })
    updateLastEditedModule('l1', { id: 'm1', title: 'Модуль' })
    expect(getLastEditedLesson()).toMatchObject({ id: 'l1', title: 'Старт', module: { id: 'm1' } })
    // чужой урок не трогаем
    updateLastEditedModule('l2', { id: 'm2', title: 'Другой' })
    expect(getLastEditedLesson().module).toMatchObject({ id: 'm1' })
  })

  it('очистка стирает запись', () => {
    setLastEditedLesson({ id: 'l1', title: 'Старт' })
    clearLastEditedLesson()
    expect(getLastEditedLesson()).toBe(null)
  })
})

describe('всплывашка «продолжить редактирование»', () => {
  const toast = read('./ResumeEditingToast.jsx')

  // Раньше окно уходило по таймеру — стоило отвлечься, и возвращаться к
  // уроку приходилось руками через модули
  it('само не исчезает — только по крестику или переходу', () => {
    expect(toast).not.toContain('HIDE_AFTER_MS')
    expect(toast).toContain('onClose?.()')
  })

  it('кнопка ведёт в урок, крестик просто закрывает', () => {
    expect(toast).toContain('onOpen(lesson)')
    expect(toast).toContain('onClick={() => setClosing(true)}>✕')
  })

  it('показывается только админу и только когда редактор закрыт', () => {
    const shell = read('../../app/ShellV2.jsx')
    expect(shell).toContain('{isAdmin && !resumeClosed && !canvasLesson && !productionLesson && (')
    expect(shell).toContain('setCanvasLesson({ id: lesson.id, moduleLessons: [], module: lesson.module ?? null })')
  })

  it('урок запоминается при открытии канваса', () => {
    const page = read('../../features/canvas/CanvasPage.jsx')
    expect(page).toContain('setLastEditedLesson({ id: lessonId, title: data?.title, module })')
  })
})
