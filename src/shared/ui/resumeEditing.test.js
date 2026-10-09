import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { shouldShowResumeToast } from '../lib/resumeToastVisible.js'
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
    expect(toast).toContain('onCloseRef.current?.()')
  })

  it('кнопка ведёт в урок, крестик просто закрывает', () => {
    expect(toast).toContain('onOpen(lesson)')
    expect(toast).toMatch(/className="resumeToastClose"[\s\S]{0,200}onClick=\{dismiss\}/)
  })

  // «Крестик кривой и срабатывает не с первого раза»: цель касания ≥44px, касание — по pointerup,
  // анимация появления не двигает кнопки, над плашкой обновления, hover только для мыши
  it('крестик: цель 44px, касание по pointerup, плашка выше .updateToast', () => {
    const css = read('../../styles/resume-toast.css')
    expect(toast).toContain("e.pointerType === 'touch'")
    expect(toast).toMatch(/className="resumeToastClose"[\s\S]{0,120}onPointerUp=/)
    expect(css).toMatch(/\.resumeToastClose \{[^}]*width: 44px;[^}]*height: 44px;[^}]*padding: 0;/)
    expect(css).toMatch(/\.resumeToastClose \{[^}]*touch-action: manipulation/)
    // анимация появления — только прозрачность (кнопки не уезжают из-под пальца)
    expect(css).not.toMatch(/@keyframes resumeToastIn \{[^}]*transform/)
    // z-index выше плашки обновления (950), иначе она перекрывает крестик
    expect(Number(css.match(/\.resumeToast \{[^}]*z-index: (\d+)/)[1])).toBeGreaterThan(950)
    // :hover — только в @media (hover: hover)
    expect(css).toMatch(/@media \(hover: hover\) \{[\s\S]*\.resumeToastClose:hover/)
  })

  it('показывается только админу, только во вкладке «Админ» и только когда редактор закрыт', () => {
    const base = { isAdmin: true, tab: 'admin', resumeClosed: false, editorOpen: false }
    expect(shouldShowResumeToast(base)).toBe(true)
    expect(shouldShowResumeToast({ ...base, isAdmin: false })).toBe(false)
    expect(shouldShowResumeToast({ ...base, resumeClosed: true })).toBe(false)
    expect(shouldShowResumeToast({ ...base, editorOpen: true })).toBe(false)
    // лента, уроки-память, рейтинг, профиль — плашки нет
    for (const tab of ['feed', 'learn', 'rating', 'profile']) {
      expect(shouldShowResumeToast({ ...base, tab })).toBe(false)
    }
  })

  it('ShellV2 берёт условие из resumeToastVisible и ведёт кнопку в канвас урока', () => {
    const shell = read('../../app/ShellV2.jsx')
    expect(shell).toContain('shouldShowResumeToast({')
    // Редактор — любой из четырёх: граф, продакшен, карточки повтора, справка слова
    expect(shell).toContain('editorOpen: !!(canvasLesson || productionLesson || cardsLesson || wordCardLesson)')
    expect(shell).toContain('setCanvasLesson({ id: lesson.id, moduleLessons: [], module: lesson.module ?? null })')
  })

  it('урок запоминается при открытии канваса', () => {
    // Загрузка урока канваса — useCanvasLessonLoad.js (вынесено из CanvasPage)
    const page = read('../../features/canvas/useCanvasLessonLoad.js')
    expect(page).toContain('setLastEditedLesson({ id: lessonId, title: data?.title, module })')
  })
})
