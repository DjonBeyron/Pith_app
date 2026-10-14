import { describe, it, expect } from 'vitest'
import { injectR2Urls, findUnlinkedMedia, diagnoseMedia } from './injectR2Urls.js'

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
  it('diagnoseMedia: потерянный файл, локальный без копии, без ссылки; здоровые и ждущие загрузки не трогает', () => {
    const nodes = [audio(1, { file_id: 'ok' }), audio(2, { file_id: 'gone' }), audio(3, { file_id: 'nolocal' }), audio(4, { file_id: 'wait' }), audio(5, { file_id: 'noref' })]
    const files = [
      { id: 'ok', status: 'synced', r2Url: 'u' },
      { id: 'nolocal', status: 'local', localFile: null },
      { id: 'wait', status: 'local', localFile: {} },
      { id: 'noref', status: 'synced', r2Url: null },
    ]
    expect(diagnoseMedia(nodes, files).map(p => [p.seq, p.reason.slice(0, 12)])).toEqual([[2, 'файл не найд'], [3, 'локальная ко'], [5, 'на сервере у']])
  })
})
