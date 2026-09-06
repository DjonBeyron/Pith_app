import { describe, it, expect } from 'vitest'
import { lintLesson, fromCanvasNodes } from './lessonLint.js'

// Каждый тест — один принцип из PROJECT.md, один синтетический урок, один
// точный результат. Цель: доказать, что проверка детерминирована — не
// «модель посчитала, что всё ок», а код нашёл нарушение или не нашёл.
//
// Ноды в формате ОБМЕНА (exportLesson.js): ref/data/triggers[].then = ref —
// том же, что нейросеть отдаёт как готовый урок. Тот же формат читает
// scripts/lint-lesson.mjs с командной строки, без входа в приложение.

function node(ref, seq, type, data, triggers = [], note) {
  return { ref, seq, type, data, triggers, ...(note ? { note } : {}) }
}

describe('lintLesson', () => {
  it('не находит замечаний в чистом уроке', () => {
    const nodes = [
      node('n1', 1, 'audio', { text: 'Привет' }, [{ if: 'played', then: 'n2' }]),
      node('n2', 2, 'phrase_assembly', { words: ['I', 'try', 'sushi'] }, [
        { if: 'phrase_correct', then: 'n3' }, { if: 'phrase_wrong', then: 'n3' },
      ]),
      node('n3', 3, 'phrase_assembly', { words: ['He', 'tries', 'cake'] }, []),
    ]
    expect(lintLesson(nodes)).toEqual([])
  })

  it('ловит дубли ref и связи в никуда', () => {
    const nodes = [
      node('n1', 1, 'text', { content: 'A' }, [{ if: 'timer', then: 'n404' }]),
      node('n1', 2, 'text', { content: 'B' }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('Дубли ref'))).toBe(true)
    expect(warnings.some(w => w.includes('никуда'))).toBe(true)
  })

  it('ловит ноду, недостижимую от старта урока', () => {
    const nodes = [
      node('n1', 1, 'text', { content: 'Старт' }, [{ if: 'timer', then: 'n2' }]),
      node('n2', 2, 'text', { content: 'Конец' }, []),
      node('n3', 3, 'text', { content: 'Забытая ветка' }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('n3'))).toBe(true)
  })

  it('ловит text сразу после audio', () => {
    const nodes = [
      node('n1', 1, 'audio', { text: 'Привет' }, [{ if: 'played', then: 'n2' }]),
      node('n2', 2, 'text', { content: 'Дальше' }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('n1') && w.includes('n2'))).toBe(true)
  })

  it('не ругается, если после audio идёт photo', () => {
    const nodes = [
      node('n1', 1, 'audio', { text: 'Привет' }, [{ if: 'played', then: 'n2' }]),
      node('n2', 2, 'photo', { imagePrompt: 'сцена в кафе, горизонталь' }, []),
    ]
    expect(lintLesson(nodes)).toEqual([])
  })

  it('ловит счётную похвалу, достижимую после ошибки', () => {
    const nodes = [
      node('n1', 1, 'phrase_assembly', { words: ['I', 'try'] }, [
        { if: 'phrase_correct', then: 'n2' },
        { if: 'phrase_wrong', then: 'n2' },
      ]),
      node('n2', 2, 'text', { content: 'Три из трёх, отлично!' }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('счётная похвала'))).toBe(true)
  })

  it('не ругается на похвалу, достижимую только по верной ветке', () => {
    const nodes = [
      node('n1', 1, 'phrase_assembly', { words: ['I', 'try'] }, [
        { if: 'phrase_correct', then: 'n2' },
        { if: 'phrase_wrong', then: 'n3' },
      ]),
      node('n2', 2, 'text', { content: 'Три из трёх, отлично!' }, []),
      node('n3', 3, 'text', { content: 'Ничего, попробуем ещё' }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('счётная похвала'))).toBe(false)
  })

  it('ловит одинаковое последнее слово ответа у соседних упражнений', () => {
    const nodes = [
      node('n1', 1, 'phrase_assembly', { words: ['He', 'tries', 'again'] }, [{ if: 'phrase_correct', then: 'n2' }]),
      node('n2', 2, 'phrase_assembly', { words: ['She', 'tries', 'again'] }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('again'))).toBe(true)
  })

  it('сравнивает соседей по расстоянию в графе, а не по seq из файла', () => {
    // seq не отражает реальный порядок прохождения: узел с seq=50 лежит
    // МЕЖДУ 5 и 100 по номеру, но в графе стоит ПОСЛЕ обоих «trying» — на
    // это и напоролся пользователь: CLI на экспорте (seq = позиция в
    // массиве) видел меньше повторов, чем редактор после importLesson()
    // (seq пересчитан по графу). Сортировка по seq спрятала бы этот повтор.
    const nodes = [
      node('n1', 1, 'text', { content: 'A' }, [{ if: 'timer', then: 'nA' }]),
      node('nA', 5, 'phrase_assembly', { words: ['I', 'am', 'trying'] }, [{ if: 'phrase_correct', then: 'nB' }]),
      node('nB', 100, 'phrase_assembly', { words: ['She', 'is', 'trying'] }, [{ if: 'phrase_correct', then: 'nFar' }]),
      node('nFar', 50, 'phrase_assembly', { words: ['He', 'tries', 'pizza'] }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('nA') && w.includes('nB'))).toBe(true)
  })

  it('не ругается, если финальные слова ответов разные', () => {
    const nodes = [
      node('n1', 1, 'phrase_assembly', { words: ['He', 'tries', 'pizza'] }, [{ if: 'phrase_correct', then: 'n2' }]),
      node('n2', 2, 'phrase_assembly', { words: ['She', 'tries', 'cake'] }, []),
    ]
    expect(lintLesson(nodes)).toEqual([])
  })

  it('ловит dictator-таблицу без script', () => {
    const nodes = [node('n1', 1, 'table', { mode: 'dictator', script: '' }, [])]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('script'))).toBe(true)
  })

  it('не ругается на manual-таблицу без script (там оно и не нужно)', () => {
    const nodes = [node('n1', 1, 'table', { mode: 'manual', answer: 'I try tea' }, [])]
    expect(lintLesson(nodes)).toEqual([])
  })

  it('ловит пустой imagePrompt при note, похожем на описание сцены', () => {
    const nodes = [
      node('n1', 1, 'photo', { imagePrompt: '' }, [], 'тёплая уличная сцена, горизонталь, мягкий свет'),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('imagePrompt'))).toBe(true)
  })

  it('не ругается, когда imagePrompt заполнен', () => {
    const nodes = [node('n1', 1, 'photo', { imagePrompt: 'сцена в кафе, горизонталь' }, [])]
    expect(lintLesson(nodes)).toEqual([])
  })

  it('ловит подсветку, выходящую за длину текста', () => {
    const nodes = [
      node('n1', 1, 'text', {
        content: 'try',
        highlights: [{ start: 0, end: 10, mode: 'text', color: '#fff' }],
      }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('подсветка'))).toBe(true)
  })

  it('ловит replyToSeq, указывающий вперёд', () => {
    const nodes = [
      node('n1', 1, 'text', { content: 'A', replyToSeq: 2 }, [{ if: 'timer', then: 'n2' }]),
      node('n2', 2, 'text', { content: 'B' }, []),
    ]
    const warnings = lintLesson(nodes)
    expect(warnings.some(w => w.includes('replyToSeq'))).toBe(true)
  })

  it('пустой урок не падает и не даёт замечаний', () => {
    expect(lintLesson([])).toEqual([])
    expect(lintLesson(null)).toEqual([])
  })

  describe('fromCanvasNodes', () => {
    it('переводит ноды из формата холста (id/typeData) в формат обмена (ref/data)', () => {
      const canvasNodes = [
        { id: 'uuid-1', seq: 1, type: 'text', typeData: { text: { content: 'A' } }, triggers: [{ if: 'timer', then: 'uuid-2' }] },
        { id: 'uuid-2', seq: 2, type: 'text', typeData: { text: { content: 'B' } }, triggers: [] },
      ]
      expect(lintLesson(fromCanvasNodes(canvasNodes))).toEqual([])
    })
  })
})
