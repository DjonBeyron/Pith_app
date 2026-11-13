import { describe, it, expect, vi } from 'vitest'

vi.mock('../api/supabase.js', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
import { fitText, collectLogs, uploadLogs, sendLogs, rememberLogFile, MAX_TEXT } from './logUpload.js'

const journalSrc = text => ({ text: () => text })
const at = new Date('2026-11-13T10:20:30Z')

describe('fitText', () => {
  it('короткий текст не трогает', () => { expect(fitText('a.txt', 'abc')).toBe('abc') })
  it('json: сначала выкидывает звук', () => {
    const t = JSON.stringify({ events: [1], audio: { base64: 'x'.repeat(100) }, audioMore: [1] })
    const r = JSON.parse(fitText('d.json', t, 120))
    expect(r.audio).toBeUndefined(); expect(r.audioMore).toBeUndefined(); expect(r.events).toEqual([1]); expect(r.audioDropped).toBeTruthy()
  })
  it('текст: оставляет хвост', () => {
    const r = fitText('a.txt', 'a'.repeat(50) + 'END', 10)
    expect(r.endsWith('aaaaaaaEND')).toBe(true); expect(r).toContain('обрезано')
  })
  it('лимит на файл разумный', () => { expect(MAX_TEXT).toBeLessThanOrEqual(4_000_000) })
})

describe('collectLogs', () => {
  it('журнал + дебаг + последний выгруженный файл', async () => {
    const out = await collectLogs({ journalSrc: journalSrc('строка'), debugLines: ['d1', 'd2'], last: { name: 'x.json', text: '{"a":1}' }, at })
    expect(out.map(f => f.name)).toEqual([expect.stringMatching(/^pithy-journal-.*\.txt$/), 'pithy-debug-2026-11-13-10-20-30.txt', 'x.json'])
    expect(out[1].text).toBe('d1\nd2')
  })
  it('файл с шапкой заменяет журнал; пустое не отправляется', async () => {
    const out = await collectLogs({ journal: { name: 'j.txt', text: 'шапка' }, journalSrc: journalSrc(''), debugLines: [], last: null, at })
    expect(out).toEqual([{ name: 'j.txt', text: 'шапка' }])
    expect(await collectLogs({ journalSrc: journalSrc('  '), debugLines: [], last: null, at })).toEqual([])
  })
  it('blob выгруженного файла читается', async () => {
    rememberLogFile({ name: 'b.json', blob: { text: async () => 'body' } })
    const out = await collectLogs({ journalSrc: journalSrc(''), debugLines: [], at })
    expect(out).toEqual([{ name: 'b.json', text: 'body' }])
    rememberLogFile(null)
  })
})

describe('uploadLogs / sendLogs', () => {
  it('успех → просим сказать «читай»', async () => {
    const client = { functions: { invoke: vi.fn(async () => ({ data: { ok: true, paths: ['logs/a'] }, error: null })) } }
    const msg = await uploadLogs([{ name: 'a', text: 't' }], { client, version: '9.9.9' })
    expect(msg).toContain('читай'); expect(client.functions.invoke).toHaveBeenCalledWith('send-log', { body: { files: [{ name: 'a', text: 't' }], version: '9.9.9' } })
  })
  it('ошибка функции: достаёт текст из тела ответа', async () => {
    const error = { message: 'non-2xx', context: { json: async () => ({ error: 'Forbidden: admin only' }) } }
    const msg = await uploadLogs([{ name: 'a', text: 't' }], { client: { functions: { invoke: async () => ({ data: null, error }) } } })
    expect(msg).toBe('Не отправилось: Forbidden: admin only')
  })
  it('сбой сети не бросает; пустой список не уходит', async () => {
    expect(await uploadLogs([{ name: 'a', text: 't' }], { client: { functions: { invoke: async () => { throw new Error('сеть') } } } })).toBe('Не отправилось: сеть')
    const client = { functions: { invoke: vi.fn() } }
    expect(await uploadLogs([], { client })).toContain('Нечего'); expect(client.functions.invoke).not.toHaveBeenCalled()
  })
  it('sendLogs: собирает и отправляет', async () => {
    const client = { functions: { invoke: vi.fn(async () => ({ data: { ok: true, paths: ['p'] }, error: null })) } }
    const msg = await sendLogs({ journal: { name: 'j.txt', text: 'шапка' }, debugLines: [], last: null, client })
    expect(msg).toContain('Отправлено'); expect(client.functions.invoke.mock.calls[0][1].body.files[0].name).toBe('j.txt')
  })
})
