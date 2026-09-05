import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exportLesson, exportLessonText } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { buildLegend, FORMAT } from './lessonSchema.js'
import { NODE_TYPES } from '../nodeTypes.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

// Урок из трёх нод: голосовое → выбор слова с особым переходом варианта → текст
const lesson = () => {
  const optId = 'opt-1'
  return [
    {
      id: 'a', seq: 1, x: 0, y: 0, size: 'max', type: 'audio',
      note: 'переснять дубль',
      typeData: {
        audio: {
          text: 'Hello', file_id: 'file-123', duration: 3.2,
          waveformData: [1, 2, 3], wordTimings: [{ w: 'Hello', t: 0 }],
        },
        text: { content: '' },
      },
      triggers: [{ id: 't1', if: 'played', then: 'b', offsetOn: true, offsetMs: 400 }],
    },
    {
      id: 'b', seq: 2, x: 370, y: 0, size: 'max', type: 'word_choice',
      typeData: {
        word_choice: {
          options: [{ id: optId, text: 'am', isCorrect: true }, { id: 'opt-2', text: 'is' }],
          responseCorrect: 'Верно!', responseWrong: '', sendPickToChat: true,
        },
      },
      triggers: [
        { id: 't2', if: 'word_correct', then: 'c' },
        { id: 't3', if: 'word_wrong', then: null },
        { id: 't4', if: optId, then: 'c' },
      ],
    },
    {
      id: 'c', seq: 3, x: 740, y: 0, size: 'max', type: 'text',
      typeData: { text: { content: 'Отлично', hardWrap: false } },
      triggers: [{ id: 't5', if: 'timer', ms: 2000, then: null }],
    },
  ]
}

describe('экспорт урока', () => {
  const out = exportLesson(lesson(), { title: 'To be' })

  it('формат помечен и легенда приложена', () => {
    expect(out.format).toBe(FORMAT)
    expect(out.lesson).toEqual({ title: 'To be', nodeCount: 3 })
    expect(Object.keys(out.legend.nodes).length).toBe(NODE_TYPES.length)
  })

  it('легенда описывает КАЖДЫЙ тип ноды — иначе разбор будет гадать', () => {
    const legend = buildLegend()
    for (const t of NODE_TYPES) {
      expect(legend.nodes[t.value], `нет описания типа ${t.value}`).toBeTruthy()
      expect(legend.nodes[t.value].what.length).toBeGreaterThan(10)
    }
  })

  it('файлы не выгружаются — вместо них пометка needs', () => {
    const audio = out.nodes[0]
    expect(audio.needs).toContain('audio')
    expect(JSON.stringify(audio)).not.toContain('file-123')
    expect(audio.data.waveformData).toBeUndefined()
    expect(audio.data.duration).toBeUndefined()
    expect(audio.data.text).toBe('Hello')
  })

  it('переходы ссылаются на ref, а не на внутренние id', () => {
    expect(out.nodes[0].triggers[0]).toEqual({ if: 'played', offsetMs: 400, then: 'n2' })
    expect(out.nodes[2].triggers[0]).toEqual({ if: 'timer', ms: 2000, then: null })
  })

  it('особый переход варианта подписан словом, а не uuid', () => {
    const variant = out.nodes[1].triggers.find(t => t.if === 'variant')
    expect(variant.variantLabel).toBe('am')
    expect(variant.then).toBe('n3')
  })

  it('комментарий продакшена едет вместе с уроком — по нему и виден стиль', () => {
    expect(out.nodes[0].note).toBe('переснять дубль')
  })

  it('таблице без озвучки файл не нужен — пометки нет', () => {
    const manual = exportLesson([{
      id: 'x', seq: 1, x: 0, y: 0, type: 'table', size: 'max',
      typeData: { table: { mode: 'manual', answer: 'I am' } }, triggers: [],
    }])
    expect(manual.nodes[0].needs).toBeUndefined()

    const dictator = exportLesson([{
      id: 'y', seq: 1, x: 0, y: 0, type: 'table', size: 'max',
      typeData: { table: { mode: 'dictator', answer: 'I am' } }, triggers: [],
    }])
    expect(dictator.nodes[0].needs).toContain('audio')
  })

  it('пустые поля не засоряют файл', () => {
    expect(out.nodes[1].data.responseWrong).toBeUndefined()
    expect(out.nodes[1].data.responseCorrect).toBe('Верно!')
  })
})

describe('импорт урока', () => {
  const roundTrip = () => importLesson(exportLessonText(lesson(), { title: 'To be' }))

  it('восстанавливает состав и порядок нод', () => {
    const { nodes } = roundTrip()
    expect(nodes.map(n => n.type)).toEqual(['audio', 'word_choice', 'text'])
    expect(nodes.map(n => n.seq)).toEqual([1, 2, 3])
  })

  it('связи восстанавливаются на новые id', () => {
    const { nodes } = roundTrip()
    const [a, b, c] = nodes
    expect(a.triggers[0].then).toBe(b.id)
    expect(a.triggers[0].offsetOn).toBe(true)
    expect(a.triggers[0].offsetMs).toBe(400)
    expect(b.triggers.find(t => t.if === 'word_correct').then).toBe(c.id)
  })

  it('особый переход варианта снова привязан к нужному варианту', () => {
    const { nodes } = roundTrip()
    const wc = nodes[1]
    const optId = wc.typeData.word_choice.options.find(o => o.text === 'am').id
    expect(wc.triggers.find(t => t.if === optId)?.then).toBe(nodes[2].id)
  })

  it('настройки ноды доезжают целиком', () => {
    const { nodes } = roundTrip()
    expect(nodes[1].typeData.word_choice.sendPickToChat).toBe(true)
    expect(nodes[1].typeData.word_choice.options.map(o => o.text)).toEqual(['am', 'is'])
    expect(nodes[0].typeData.audio.text).toBe('Hello')
  })

  it('файлы не восстанавливаются — их подкладывают в редакторе', () => {
    const { nodes } = roundTrip()
    expect(nodes[0].typeData.audio.file_id).toBe(null)
  })

  it('id всегда новые — импорт не затирает существующие ноды', () => {
    const { nodes } = roundTrip()
    expect(nodes.map(n => n.id)).not.toContain('a')
    expect(new Set(nodes.map(n => n.id)).size).toBe(3)
  })

  it('таблица получает id ячеек — на них ссылается монтаж', () => {
    const { nodes } = importLesson({
      format: FORMAT,
      nodes: [{
        ref: 'n1', type: 'table',
        data: {
          mode: 'manual', answer: 'I am',
          table: {
            rowCount: 1, colCount: 2,
            columns: [{ widthPct: 50 }, { widthPct: 50 }],
            rows: [{ heightPct: 100 }],
            cells: [{ row: 0, col: 0, value: 'I' }, { row: 0, col: 1, value: 'am' }],
          },
        },
        triggers: [{ if: 'table_correct', then: null }],
      }],
    })
    const t = nodes[0].typeData.table.table
    expect(t.cells.every(c => !!c.id)).toBe(true)
    expect(t.cells[0].rowspan).toBe(1)
    expect(t.columns.every(c => !!c.id)).toBe(true)
  })

  it('координаты можно не указывать — раскладка построится сама', () => {
    const { nodes } = importLesson({
      format: FORMAT,
      nodes: [
        { ref: 'a', type: 'text', data: { content: '1' }, triggers: [{ if: 'timer', ms: 2000, then: 'b' }] },
        { ref: 'b', type: 'text', data: { content: '2' }, triggers: [] },
      ],
    })
    expect(nodes[0].x).toBeLessThan(nodes[1].x)
    expect(nodes[0].triggers[0].then).toBe(nodes[1].id)
  })

  it('битый вход объясняет, что не так', () => {
    expect(() => importLesson('{')).toThrow()
    expect(() => importLesson({ format: 'other', nodes: [] })).toThrow(/Чужой формат/)
    expect(() => importLesson({ nodes: [] })).toThrow(/нет массива nodes/)
  })

  it('неизвестный тип и висячая ссылка попадают в предупреждения, остальное грузится', () => {
    const { nodes, warnings } = importLesson({
      format: FORMAT,
      nodes: [
        { ref: 'a', type: 'wat', triggers: [] },
        { ref: 'b', type: 'text', data: { content: 'ok' }, triggers: [{ if: 'timer', then: 'zzz' }] },
      ],
    })
    expect(nodes).toHaveLength(1)
    expect(warnings.join(' ')).toMatch(/неизвестный тип/)
    expect(warnings.join(' ')).toMatch(/неизвестную ноду/)
  })
})

describe('панель обмена в шапке холста', () => {
  it('кнопка открывает панель со снимком нод', () => {
    const actions = read('../CanvasHeaderActions.jsx')
    expect(actions).toContain('className="canvasPageShare"')
    expect(actions).toContain('setIoNodes(boardApiRef.current?.getNodes() ?? [])')
    expect(read('../CanvasPage.jsx')).toContain('<LessonIoPanel')
  })

  it('импорт умеет и заменить урок, и дописать к нему', () => {
    const panel = read('./LessonIoPanel.jsx')
    expect(panel).toContain("runImport('replace')")
    expect(panel).toContain("runImport('append')")
    const api = read('../useCanvasBoardApi.js')
    expect(api).toContain('importNodes(list, mode)')
    expect(api).toContain("if (mode === 'replace') {")
    expect(api).toContain('const next = renumber(withFiles)')
  })
})

describe('импорт из файла и видимый итог', () => {
  it('импорт сообщает, сколько связей приехало', () => {
    const r = importLesson(exportLessonText(lesson(), { title: 'To be' }))
    // audio→wc, wc(correct)→text, wc(вариант «am»)→text
    expect(r.links).toBe(3)
  })

  it('файл без единой связи — отдельное предупреждение', () => {
    const r = importLesson({
      format: FORMAT,
      nodes: [
        { ref: 'a', type: 'text', data: { content: '1' }, triggers: [{ if: 'timer', ms: 2000, then: null }] },
        { ref: 'b', type: 'text', data: { content: '2' }, triggers: [] },
      ],
    })
    expect(r.links).toBe(0)
    expect(r.warnings.join(' ')).toMatch(/нет ни одной связи/)
  })

  it('в панели есть выбор файла, перетаскивание и разбор без применения', () => {
    const panel = read('./LessonIoPanel.jsx')
    expect(panel).toContain("type=\"file\"")
    expect(panel).toContain('accept=".json,application/json"')
    expect(panel).toContain('readFile(e.dataTransfer.files?.[0])')
    expect(panel).toContain('onClick={check}')
    expect(panel).toContain('Разобрано: ${r.nodes.length} нод, ${r.links} связей')
  })

  it('после импорта холст показывает первую ноду и итог в строке статуса', () => {
    expect(read('../useCanvasBoardApi.js')).toContain('centerOn(list[0], true)')
    expect(read('../CanvasPage.jsx')).toContain('Импортировано: ${nodes.length} нод · ${links} связей')
  })
})

describe('сводка по холсту', () => {
  it('панель показывает триггеры, связи и размеры нод текущего урока', () => {
    const panel = read('./LessonIoPanel.jsx')
    expect(panel).toContain("nodes.reduce((sum, n) => sum + (n.triggers?.length ?? 0), 0)")
    expect(panel).toContain("(n.triggers ?? []).filter(t => t.then).length")
    expect(panel).toContain("размеры: ${sizes")
  })

  it('порты и связи рисуются только у max-нод — размеры важны для диагностики', async () => {
    const conn = readFileSync(fileURLToPath(new URL('../CanvasConnections.jsx', import.meta.url)), 'utf8')
    expect(conn).toContain("node.size !== 'max' ? [] :")
    expect(conn).toContain("n.size === 'max' && (n.triggers ?? []).length > 0")
  })
})
