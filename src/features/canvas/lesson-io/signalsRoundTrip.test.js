import { describe, it, expect, beforeEach } from 'vitest'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

// Урок: table (ручной режим) с сигналом на слот 0 → аудио-нода; phrase_assembly
// с сигналом на слот 1 → текстовая нода. Проверяем полный круг signals[].ref:
// внутренний id (как хранит редактор) → n-ref в экспорте → снова id при импорте.
function lesson() {
  return [
    {
      id: 'sig-audio', seq: 1, x: 0, y: 0, size: 'max', type: 'audio',
      typeData: { audio: { text: 'Это местоимение первого лица' } },
      triggers: [],
    },
    {
      id: 'sig-text', seq: 2, x: 0, y: 0, size: 'max', type: 'text',
      typeData: { text: { content: 'Проверь форму глагола' } },
      triggers: [],
    },
    {
      id: 'tbl', seq: 3, x: 0, y: 0, size: 'max', type: 'table',
      typeData: {
        table: {
          mode: 'manual', answer: 'I try',
          table: { rowCount: 1, colCount: 2, columns: [], rows: [], cells: [] },
          signals: [{ slot: 0, ref: 'sig-audio' }],
        },
      },
      // table_correct → pa: настоящая связь основного потока, чтобы importLesson
      // не жаловался «нет ни одной связи» (проверка на это — про triggers.then,
      // сигналы ошибок в основной поток не входят и на неё не влияют)
      triggers: [{ id: 't1', if: 'table_correct', then: 'pa' }, { id: 't2', if: 'table_wrong', then: null }],
    },
    {
      id: 'pa', seq: 4, x: 0, y: 0, size: 'max', type: 'phrase_assembly',
      typeData: {
        phrase_assembly: {
          words: ['She', 'tries'],
          signals: [{ slot: 1, ref: 'sig-text' }],
        },
      },
      triggers: [{ id: 't3', if: 'phrase_correct', then: null }, { id: 't4', if: 'phrase_wrong', then: null }],
    },
  ]
}

describe('signals — экспорт', () => {
  const out = exportLesson(lesson(), { title: 'Signals' })

  it('signals[].ref у table меняется на n-ref цели, не остаётся внутренним id', () => {
    const tbl = out.nodes.find(n => n.type === 'table')
    const audioRef = out.nodes.find(n => n.type === 'audio').ref
    expect(tbl.data.signals).toEqual([{ slot: 0, ref: audioRef }])
    expect(audioRef).not.toBe('sig-audio') // это n-ref ("n1"), не внутренний id
  })

  it('signals[].ref у phrase_assembly меняется на n-ref цели', () => {
    const pa = out.nodes.find(n => n.type === 'phrase_assembly')
    const textRef = out.nodes.find(n => n.type === 'text').ref
    expect(pa.data.signals).toEqual([{ slot: 1, ref: textRef }])
  })

  it('сигнал на несуществующую ноду не попадает в экспорт (как и битый then у триггера)', () => {
    const broken = exportLesson([
      { id: 'x', seq: 1, x: 0, y: 0, size: 'max', type: 'phrase_assembly',
        typeData: { phrase_assembly: { words: ['a'], signals: [{ slot: 0, ref: 'gone' }] } }, triggers: [] },
    ], { title: 't' })
    expect(broken.nodes[0].data.signals).toBeUndefined()
  })
})

describe('signals — импорт (полный круг)', () => {
  const exported = exportLesson(lesson(), { title: 'Signals' })
  const { nodes, warnings } = importLesson(exported)

  it('импорт проходит без предупреждений', () => {
    expect(warnings).toEqual([])
  })

  it('signals[].ref у table снова указывает на РЕАЛЬНЫЙ id ноды-аудио этого импорта', () => {
    const tbl = nodes.find(n => n.type === 'table')
    const audio = nodes.find(n => n.type === 'audio')
    expect(tbl.typeData.table.signals).toEqual([{ slot: 0, ref: audio.id }])
  })

  it('signals[].ref у phrase_assembly снова указывает на РЕАЛЬНЫЙ id текстовой ноды', () => {
    const pa = nodes.find(n => n.type === 'phrase_assembly')
    const text = nodes.find(n => n.type === 'text')
    expect(pa.typeData.phrase_assembly.signals).toEqual([{ slot: 1, ref: text.id }])
  })

  it('сигнал на ref, которого нет среди нод файла, тихо отбрасывается', () => {
    const { nodes: n2 } = importLesson({
      format: 'pithy-lesson', version: 1,
      nodes: [
        { ref: 'n1', type: 'phrase_assembly', seq: 1, data: { words: ['a'], signals: [{ slot: 0, ref: 'n99' }] }, triggers: [] },
      ],
    })
    expect(n2[0].typeData.phrase_assembly.signals).toEqual([])
  })

  it('лесс без поля signals у table/phrase_assembly — обратная совместимость, ничего не падает', () => {
    const { nodes: n2, warnings: w2 } = importLesson({
      format: 'pithy-lesson', version: 1,
      nodes: [
        { ref: 'n1', type: 'phrase_assembly', seq: 1, data: { words: ['a'] }, triggers: [] },
      ],
    })
    expect(w2).toEqual([])
    expect(n2[0].typeData.phrase_assembly.signals).toBeUndefined()
  })
})
