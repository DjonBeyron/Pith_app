import { describe, it, expect } from 'vitest'
import { pickSceneEvictions, SCENE_BLOB_BUDGET } from './sceneBlobBudget.js'

const MB = 1024 * 1024
const f = (id, rank, size, nodeId = 'n' + rank) => ({ id, rank, size, nodeId })

describe('бюджет blob озвучки сцен', () => {
  it('в пределах 6 МБ ничего не выгружается', () => {
    expect(SCENE_BLOB_BUDGET).toBe(6 * MB)
    expect(pickSceneEvictions([f('a', 0, 3 * MB), f('b', 1, 3 * MB)])).toEqual([])
  })

  it('сверх бюджета выгружаются самые старые по показу, пока не уложимся', () => {
    const files = [f('a', 0, 2 * MB), f('b', 1, 2 * MB), f('c', 2, 2 * MB), f('d', 3, 2 * MB)]
    expect(pickSceneEvictions(files)).toEqual(['a'])
    expect(pickSceneEvictions([...files, f('e', 4, 2 * MB)])).toEqual(['a', 'b'])
  })

  it('нода только что догруженного файла и самая новая сцена не выгружаются', () => {
    const files = [f('a', 0, 4 * MB), f('b', 1, 4 * MB), f('c', 2, 4 * MB)]
    expect(pickSceneEvictions(files, { protectNodeId: 'n0' })).toEqual(['b'])
    const only = [f('x', 5, 9 * MB)]
    expect(pickSceneEvictions(only)).toEqual([]) // единственная (она же новейшая) сцена остаётся целиком
  })

  it('файлы одной ноды уходят вместе по порядку; размер неизвестный (0) не ломает счёт', () => {
    const files = [f('a1', 0, 3 * MB, 'n0'), f('a2', 0, 3 * MB, 'n0'), f('b', 1, 1 * MB), f('z', 2, 0)]
    expect(pickSceneEvictions(files)).toEqual(['a1'])
  })
})
