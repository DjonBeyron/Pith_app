import { describe, it, expect } from 'vitest'
import { buildBatchPlan, scopeOf } from './batchGenPlan.js'

// План массовой генерации: обычный режим — все ноды без файла; режим «только сломанные» (scope из списка BrokenNodesBadge) —
// только эти ноды, их битый файл считается отсутствующим, ссылки в нодах не трогаются (баг 2026-10-21: кнопка «Озвучить и сгенерировать
// заново» открывала генерацию по ВСЕМ нодам без файла и заранее снимала ссылки — закрыл окно, и список сломанных пропал)
const audio = (id, seq, file_id, text = 'Hi') => ({ id, seq, type: 'audio', typeData: { audio: { text, file_id, r2Url: file_id ? 'u' : null } } })
const nodes = [
  audio('a1', 1, 'f1'), audio('a2', 2, null), audio('a3', 3, 'f3'),
  { id: 'p1', seq: 4, type: 'photo_choice', typeData: { photo_choice: { photos: [{ id: 'x', fileId: 'fx', label: 'cat' }, { id: 'y', fileId: 'fy', label: 'dog' }] } } },
  { id: 't1', seq: 5, type: 'table', typeData: { table: { mode: 'plain', file_id: 'ft' } } },
  { id: 's1', seq: 6, type: 'scene', typeData: { scene: {} } },
  { id: 'ph', seq: 7, type: 'photo', typeData: { photo: { file_id: 'fp', imagePrompt: 'sun' } } },
]

describe('buildBatchPlan', () => {
  it('обычный режим: только ноды без файла', () => {
    const plan = buildBatchPlan(nodes)
    expect(plan.items.map(i => i.key)).toEqual(['a2'])
    expect(plan.skipped).toEqual([])
  })

  it('scope: только сломанные; файл у них считается отсутствующим, у photo_choice — только битые варианты', () => {
    const scope = scopeOf([
      { id: 'a3', type: 'audio', badFiles: [{ fileId: 'f3', photoId: null }] },
      { id: 'p1', type: 'photo_choice', badFiles: [{ fileId: 'fy', photoId: 'y' }] },
      { id: 'ph', type: 'photo', badFiles: [] },
    ])
    const plan = buildBatchPlan(nodes, scope)
    expect(plan.items.map(i => i.key)).toEqual(['a3', 'p1:y', 'ph']) // a2 (просто без файла) и целый вариант x — не трогаем
    expect(plan.audioTotal).toBe(1)
    expect(plan.photoTotal).toBe(2)
    expect(plan.skipped).toEqual([])
    // сами ноды не изменились
    expect(nodes[2].typeData.audio.file_id).toBe('f3')
  })

  it('scope: что не умеем — в пропущенные с причиной (сцена, обычная таблица, тип без генерации)', () => {
    const scope = scopeOf([{ id: 't1', type: 'table', badFiles: [] }, { id: 's1', type: 'scene', badFiles: [] }, { id: 'a1', type: 'audio', badFiles: [] }])
    const plan = buildBatchPlan([...nodes, { id: 'v', seq: 8, type: 'video', typeData: {} }], scope)
    expect(plan.items.map(i => i.key)).toEqual(['a1'])
    expect(plan.skipped.map(s => [s.seq, s.reason])).toEqual([
      [5, 'не авто-таблица: озвучка только у режима «диктор»'],
      [6, 'сцены озвучиваются в сборщике сцены'],
    ])
    expect(scopeOf(null)).toBeNull()
  })
})
