import { describe, it, expect } from 'vitest'
import { collectNodeUrls, allUrls, classifyProbe, buildHealth } from './lessonHealth.js'

const audio = (id, seq, fileId, extra = {}) => ({ id, seq, type: 'audio', typeData: { audio: { file_id: fileId, ...extra } }, triggers: [] })
const files = [
  { id: 'f1', status: 'synced', r2Url: 'https://r2.dev/a.mp3' },
  { id: 'f2', status: 'synced', r2Url: 'https://r2.dev/b.mp3' },
]

describe('сломанные ноды — чистая логика (lessonHealth.js)', () => {
  it('ссылки нод: голосовые по файлу, сцена — по озвучке реплик, текст — ничего; без дублей', () => {
    const scene = { id: 's', seq: 3, type: 'scene', typeData: { scene: { scene: { version: 2, timeline: [
      { who: 'a', text: 'Hi', audioUrl: 'https://r2.dev/s1.mp3' }, { who: 'b', text: 'Yo', audioUrl: 'https://r2.dev/s1.mp3' },
    ] } } }, triggers: [] }
    const text = { id: 't', seq: 2, type: 'text', typeData: { text: { text: 'x' } }, triggers: [] }
    const e = collectNodeUrls([audio('n1', 1, 'f1'), text, scene], files)
    expect(e.map(x => ({ id: x.id, seq: x.seq, type: x.type, urls: x.urls }))).toEqual([
      { id: 'n1', seq: 1, type: 'audio', urls: ['https://r2.dev/a.mp3'] },
      { id: 's', seq: 3, type: 'scene', urls: ['https://r2.dev/s1.mp3'] },
    ])
    expect(allUrls([...e, { urls: ['https://r2.dev/a.mp3'] }])).toEqual(['https://r2.dev/a.mp3', 'https://r2.dev/s1.mp3'])
  })

  it('ссылка — по записи файла, а не по старому r2Url в typeData: новый локальный файл ждёт сохранения (pending), не проверяется и не ломает', () => {
    const loc = [...files, { id: 'new', status: 'local', localFile: {}, r2Url: null }]
    const n = audio('n1', 1, 'new', { r2Url: 'https://r2.dev/old-404.mp3' })
    expect(collectNodeUrls([n], loc)).toEqual([{ id: 'n1', seq: 1, type: 'audio', urls: [], refs: [], pending: 1 }])
    const h = buildHealth([n], loc, new Map([['https://r2.dev/old-404.mp3', { status: 404 }]]))
    expect(h.broken).toEqual([])
    expect(h.pending).toBe(1)
    // без file_id ссылка из typeData — проверяется
    expect(collectNodeUrls([{ id: 'x', seq: 2, type: 'audio', typeData: { audio: { r2Url: 'https://r2.dev/direct.mp3' } }, triggers: [] }], files)[0].urls).toEqual(['https://r2.dev/direct.mp3'])
  })

  // перегенерация сломанных — через scope массовой генерации (batchGenPlan.test.js), ссылки заранее не сбрасываются
  it('fixable по типу; badFiles — какой файл/вариант битый', () => {
    const h = buildHealth([audio('n1', 1, 'f1'), { id: 's', seq: 2, type: 'scene', typeData: { scene: { scene: { version: 2, timeline: [{ who: 'a', text: 'Hi', audioUrl: 'https://r2.dev/s.mp3' }] } } }, triggers: [] }], files,
      new Map([['https://r2.dev/a.mp3', { status: 404 }], ['https://r2.dev/s.mp3', { status: 404 }]]))
    expect(h.broken.map(b => [b.type, b.fixable])).toEqual([['audio', true], ['scene', false]])
    expect(h.broken[0].badFiles).toEqual([{ fileId: 'f1', photoId: null }])
  })

  it('вердикт по пробе: 404/403 — нет файла; 5xx — ошибка; 0 байт — пустой; html — страница ошибки; сеть — «не удалось»; 200 — ок', () => {
    expect(classifyProbe({ status: 404 })).toEqual({ ok: false, reason: 'файла нет на сервере (HTTP 404)' })
    expect(classifyProbe({ status: 403 }).ok).toBe(false)
    expect(classifyProbe({ status: 500 }).reason).toContain('HTTP 500')
    expect(classifyProbe({ status: 200, contentLength: 0 }).reason).toContain('пустой')
    expect(classifyProbe({ status: 200, contentType: 'text/html; charset=utf-8' }).reason).toContain('text/html')
    expect(classifyProbe({ status: 0, error: 'Failed to fetch' })).toEqual({ ok: null, reason: 'не удалось проверить (Failed to fetch)' })
    expect(classifyProbe({ status: 200, contentType: 'audio/mpeg', contentLength: 12345 })).toEqual({ ok: true })
    expect(classifyProbe({ status: 206, contentType: 'audio/mpeg', contentLength: 12345 })).toEqual({ ok: true })
    expect(classifyProbe(null).ok).toBeNull()
  })

  it('сводка: сломанные ноды по пробам и по потерянным файлам, счётчики проверки, сортировка по seq', () => {
    const nodes = [audio('n2', 2, 'f2'), audio('n1', 1, 'f1'), audio('n3', 3, 'lost')]
    const probes = new Map([
      ['https://r2.dev/a.mp3', { status: 404 }],
      ['https://r2.dev/b.mp3', { status: 0, error: 'Failed to fetch' }],
    ])
    const h = buildHealth(nodes, files, probes)
    expect(h.broken.map(b => b.seq)).toEqual([1, 3])
    expect(h.broken[0]).toEqual({ id: 'n1', seq: 1, type: 'audio', label: '', reasons: ['файла нет на сервере (HTTP 404): a.mp3'], badFiles: [{ fileId: 'f1', photoId: null }], fixable: true })
    expect(h.broken[1].reasons[0]).toContain('потерян')
    expect(buildHealth([audio('n9', 9, 'lost', { text: 'Привет, это текст голосового' })], files, new Map()).broken[0].label).toBe('Привет, это текст голосового')
    expect(h.unknown).toBe(1)
    expect(h.checked).toBe(2)
    expect(h.total).toBe(2)
    // пока проб нет — только потерянные файлы, ничего не проверено
    const h0 = buildHealth(nodes, files, new Map())
    expect(h0.broken.map(b => b.seq)).toEqual([3])
    expect(h0.checked).toBe(0)
  })
})
