import { describe, it, expect } from 'vitest'
import { pictureOptions, pickPictureTask, openPicture } from './pictureTasks.js'

const photo = (i, over = {}) => ({ id: `p${i}`, photoUrl: `https://r2.dev/${i}.png`, imagePrompt: `картинка ${i}`, label: 'She tries yoga', ...over })
const node = (photos, correctIndexes = [0]) => ({ id: 'n', type: 'photo_choice', typeData: { photo_choice: { photos, correctIndexes } } })
const deck = (nodes, id = 'm1') => ({ phrase: 'p', modules: [{ id, title: 'p' }], cards: nodes.map((n, i) => ({ id: `k${i}`, nodes: [n], teacher: {} })) })
const first = () => 0

describe('pictureOptions: три картинки', () => {
  it('одна верная + две неверные, верная помечена; перемешано', () => {
    const o = pictureOptions(node([photo(0), photo(1), photo(2), photo(3)], [0]), first)
    expect(o).toHaveLength(3)
    expect(o.filter(x => x.correct)).toHaveLength(1)
    expect(o.find(x => x.correct).url).toBe('https://r2.dev/0.png')
    expect(o[0].alt).toBe('картинка ' + o[0].id.slice(1))
  })

  it('неверных не больше двух, даже если фото много; label не попадает в данные', () => {
    const o = pictureOptions(node(Array.from({ length: 6 }, (_, i) => photo(i)), [2]), Math.random)
    expect(o).toHaveLength(3)
    expect(o.filter(x => !x.correct)).toHaveLength(2)
    expect(JSON.stringify(o)).not.toContain('yoga')
  })

  it('из нескольких верных берётся одна', () => {
    const o = pictureOptions(node([photo(0), photo(1), photo(2), photo(3)], [0, 1]), first)
    expect(o.filter(x => x.correct)).toHaveLength(1)
  })

  it('мало картинок, нет верной, нет адресов — null', () => {
    expect(pictureOptions(node([photo(0), photo(1)], [0]))).toBeNull()
    expect(pictureOptions(node([photo(0), photo(1), photo(2)], []))).toBeNull()
    expect(pictureOptions(node([photo(0), photo(1), photo(2)], [9]))).toBeNull()
    expect(pictureOptions(node([photo(0), photo(1, { photoUrl: null }), photo(2)], [0]))).toBeNull()
    expect(pictureOptions(node([photo(0, { photoUrl: 'blob:x' }), photo(1), photo(2)], [0]))).toBeNull()
    expect(pictureOptions(null)).toBeNull()
  })
})

describe('pickPictureTask', () => {
  const good = node([photo(0), photo(1), photo(2)], [1])
  const audio = new Map([['keep', { url: 'https://r2.dev/keep.mp3', duration: 0.8 }]])

  it('нет ни одной карточки photo_choice — молчит', () => {
    expect(pickPictureTask(new Map([['keep', deck([{ id: 'x', type: 'text', typeData: {} }])]]), { wordAudio: audio })).toBeNull()
    expect(pickPictureTask(new Map(), {})).toBeNull()
    expect(pickPictureTask(null, {})).toBeNull()
    expect(pickPictureTask(new Map([['keep', deck([node([photo(0)], [0])])]]), {})).toBeNull() // фото-выбор без трёх картинок
  })

  it('задача: слово, модуль, три картинки и озвучка слова из word_audio', () => {
    const r = pickPictureTask(new Map([['keep', deck([good])]]), { wordAudio: audio, rand: first })
    expect(r.word).toBe('keep')
    expect(r.moduleId).toBe('m1')
    expect(r.task.options).toHaveLength(3)
    expect(r.task.audioUrl).toBe('https://r2.dev/keep.mp3')
  })

  it('озвучки слова нет — audioUrl null (слово покажут текстом)', () => {
    const r = pickPictureTask(new Map([['keep', deck([good])]]), { wordAudio: new Map(), rand: first })
    expect(r.task.audioUrl).toBeNull()
    expect(pickPictureTask(new Map([['keep', deck([good])]]), { rand: first }).task.audioUrl).toBeNull()
  })

  it('уже предложенные пропускаются; слова не из памяти — раньше', () => {
    const d = new Map([['keep', deck([good])], ['try', deck([good], 'm2')]])
    expect(pickPictureTask(d, { exclude: ['keep', 'try'] })).toBeNull()
    expect(pickPictureTask(d, { inMemory: new Set(['keep']), rand: first }).word).toBe('try')
    expect(pickPictureTask(d, { inMemory: new Set(['keep', 'try']), rand: first }).word).toBe('keep')
  })
})

describe('openPicture: звук проверяется в момент показа', () => {
  const pick = { word: 'keep', task: { options: [], audioUrl: 'https://r2.dev/keep.mp3' } }
  it('звук есть — озвучка остаётся; нет — слово текстом', () => {
    expect(openPicture(pick, { sound: true }).task.audioUrl).toBe('https://r2.dev/keep.mp3')
    expect(openPicture(pick, { sound: false }).task.audioUrl).toBeNull()
    expect(pick.task.audioUrl).not.toBeNull()
  })
})
