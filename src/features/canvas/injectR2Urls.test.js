import { describe, it, expect } from 'vitest'
import { injectR2Urls, findUnlinkedMedia } from './injectR2Urls.js'

const audio = (seq, d) => ({ id: 'a' + seq, seq, type: 'audio', typeData: { audio: d } })

describe('findUnlinkedMedia: файл есть, ссылки нет — пользователь медиа не увидит', () => {
  it('находит ноды с file_id без r2Url и варианты фото без photoUrl', () => {
    const nodes = [
      audio(1, { file_id: 'f1', r2Url: 'https://r2/a.mp3' }),
      audio(2, { file_id: 'f2' }),
      audio(3, { text: 'без файла' }),
      { id: 'p', seq: 4, type: 'photo_choice', typeData: { photo_choice: { photos: [{ fileId: 'x' }, { fileId: 'y', photoUrl: 'u' }] } } },
    ]
    expect(findUnlinkedMedia(nodes)).toEqual(['audio#2', 'photo_choice#4'])
  })
  it('после injectR2Urls с загруженным файлом ссылка есть; с локальным — нет', () => {
    const nodes = [audio(1, { file_id: 'f1' }), audio(2, { file_id: 'f2' })]
    const out = injectR2Urls(nodes, [{ id: 'f1', r2Url: 'https://r2/1.mp3' }, { id: 'f2', status: 'local', r2Url: null }])
    expect(findUnlinkedMedia(out)).toEqual(['audio#2'])
  })
})
