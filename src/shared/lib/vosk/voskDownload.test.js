import { describe, it, expect, vi } from 'vitest'
import { fakeCaches, fakeResponse, gzBytes, slices } from './voskTestKit.js'
import { downloadModel, getModel, chooseSource, percentOf, isComplete, makeSpeedMeter, sniffArchive, fmtMb, fmtSpeed } from './voskDownload.js'
import { peekCached } from './voskStorage.js'

const URL1 = 'https://pub-1.r2.dev/chat/model.gz'
const body = gzBytes(40)
const noSleep = vi.fn(async () => {})
const fetchOk = (extra = {}) => vi.fn(async (_u, o) => fakeResponse(slices(body, 10), { headers: { 'content-length': '40' }, signal: o?.signal, ...extra }))

describe('voskDownload: чистые функции', () => {
  it('проценты, полнота по Content-Length, форматы', () => {
    expect(percentOf(10, 40)).toBe(25)
    expect(percentOf(40, 40)).toBe(100)
    expect(percentOf(50, 40)).toBe(100)
    expect(percentOf(10, null)).toBeNull()
    expect(isComplete(40, 40)).toBe(true)
    expect(isComplete(39, 40)).toBe(false)
    expect(isComplete(5, null)).toBe(true)
    expect(isComplete(0, null)).toBe(false)
    expect(fmtMb(40.2 * 1048576)).toBe('40.2 МБ')
    expect(fmtMb(null)).toBe('—')
    expect(fmtSpeed(2097152)).toBe('2.00 МБ/с')
  })
  it('скорость по окну последних 3 секунд', () => {
    const m = makeSpeedMeter(3000)
    expect(m(0, 0)).toBe(0)
    expect(m(1000, 1048576)).toBe(1048576)
    expect(m(2000, 2 * 1048576)).toBe(1048576)
    expect(m(10000, 2 * 1048576 + 100)).toBeLessThan(1000) // стояли 8 секунд — скорость упала
  })
  it('источник: кеш, сеть только по разрешению, иначе блок', () => {
    expect(chooseSource({ size: 1 }, false)).toBe('cache')
    expect(chooseSource({ size: 1 }, true)).toBe('cache')
    expect(chooseSource(null, true)).toBe('network')
    expect(chooseSource(null, false)).toBe('blocked')
  })
  it('что за файл по первым байтам', () => {
    expect(sniffArchive(gzBytes(600))).toBe('gzip')
    expect(sniffArchive(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('zip')
    expect(sniffArchive(new TextEncoder().encode('<!DOCTYPE html>'))).toBe('html')
    const tar = new Uint8Array(512); tar.set(new TextEncoder().encode('ustar'), 257)
    expect(sniffArchive(tar)).toBe('tar')
    expect(sniffArchive(new Uint8Array(512).fill(3))).toBe('unknown')
  })
})

describe('voskDownload: скачивание', () => {
  it('прогресс растёт до 100%, скорость считается, результат — Blob нужного размера', async () => {
    let t = 0
    const seen = []
    const r = await downloadModel(URL1, { fetchFn: fetchOk(), now: () => (t += 500), onProgress: p => seen.push(p) })
    expect(seen.map(p => p.pct)).toEqual([25, 50, 75, 100])
    expect(seen.map(p => p.loaded)).toEqual([10, 20, 30, 40])
    expect(seen.at(-1).total).toBe(40)
    expect(seen.at(-1).speed).toBeGreaterThan(0)
    expect(r.size).toBe(40)
    expect(r.blob.size).toBe(40)
    expect(r.attempts).toBe(1)
  })
  it('неполный ответ (меньше Content-Length) — ошибка «не полностью», повторяется до 3 раз', async () => {
    const f = vi.fn(async () => fakeResponse(slices(gzBytes(30), 10), { headers: { 'content-length': '40' } }))
    await expect(downloadModel(URL1, { fetchFn: f, sleep: noSleep })).rejects.toMatchObject({ code: 'incomplete' })
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('сеть оборвалась на первой попытке — вторая успешна, пауза и сообщение о попытке', async () => {
    let n = 0
    const f = vi.fn(async (u, o) => {
      if (o?.method === 'HEAD') throw new TypeError('offline')
      if (++n === 1) throw new TypeError('Failed to fetch')
      return fakeResponse(slices(body, 20), { headers: { 'content-length': '40' }, signal: o?.signal })
    })
    const sleep = vi.fn(async () => {})
    const onAttempt = vi.fn()
    const r = await downloadModel(URL1, { fetchFn: f, sleep, pauseMs: 1234, onAttempt })
    expect(r.attempts).toBe(2)
    expect(sleep).toHaveBeenCalledWith(1234, undefined)
    expect(onAttempt.mock.calls[0][0]).toBe(2)
    expect(onAttempt.mock.calls[0][1].code).toBe('network')
  })
  it('обрыв посреди тела — «сеть пропала», а не CORS', async () => {
    const f = vi.fn(async () => fakeResponse(slices(body, 10), { headers: { 'content-length': '40' }, failAfter: true }))
    await expect(downloadModel(URL1, { fetchFn: f, sleep: noSleep, attempts: 1 })).rejects.toMatchObject({ code: 'network' })
  })
  it('404: без повторов, текст с кодом', async () => {
    const f = vi.fn(async () => fakeResponse([], { status: 404 }))
    await expect(downloadModel(URL1, { fetchFn: f, sleep: noSleep })).rejects.toThrow('Адрес недоступен (код 404)')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('CORS: GET упал без ответа, а HEAD no-cors дошёл — без повторов, «закрыт CORS»', async () => {
    const f = vi.fn(async (u, o) => { if (o?.mode === 'no-cors') return {}; throw new TypeError('Failed to fetch') })
    await expect(downloadModel(URL1, { fetchFn: f, sleep: noSleep })).rejects.toThrow(/закрыт CORS/)
    expect(f).toHaveBeenCalledTimes(2) // GET + одна диагностика
  })
  it('веб-страница вместо архива — понятная ошибка без повторов', async () => {
    const f = vi.fn(async () => fakeResponse([], { headers: { 'content-type': 'text/html; charset=utf-8' } }))
    await expect(downloadModel(URL1, { fetchFn: f, sleep: noSleep })).rejects.toMatchObject({ code: 'html' })
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('отмена посреди скачивания', async () => {
    const ac = new AbortController()
    const f = vi.fn(async (_u, o) => fakeResponse(slices(body, 10), { headers: { 'content-length': '40' }, signal: o.signal, hang: true }))
    const p = downloadModel(URL1, { fetchFn: f, signal: ac.signal, sleep: noSleep, onProgress: pr => { if (pr.loaded === 40) ac.abort() } })
    await expect(p).rejects.toMatchObject({ code: 'cancelled' })
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('зависание без данных дольше таймаута — «зависло»', async () => {
    const f = vi.fn(async (_u, o) => fakeResponse([], { headers: { 'content-length': '40' }, signal: o.signal, hang: true }))
    await expect(downloadModel(URL1, { fetchFn: f, stallMs: 20, attempts: 1 })).rejects.toMatchObject({ code: 'stall' })
  })
  it('размер неизвестен (нет Content-Length или тело сжато браузером): процентов нет, непустой ответ принимается', async () => {
    const seen = []
    const f1 = vi.fn(async () => fakeResponse(slices(body, 20)))
    const r1 = await downloadModel(URL1, { fetchFn: f1, onProgress: p => seen.push(p) })
    expect(r1.total).toBeNull()
    expect(seen.every(p => p.pct === null)).toBe(true)
    const f2 = vi.fn(async () => fakeResponse(slices(body, 20), { headers: { 'content-length': '10', 'content-encoding': 'gzip' } }))
    expect((await downloadModel(URL1, { fetchFn: f2 })).size).toBe(40)
  })
})

describe('voskDownload: getModel (кеш / сеть)', () => {
  it('без разрешения и без кеша — не качает вообще (нет авто-скачивания)', async () => {
    const f = vi.fn()
    await expect(getModel(URL1, { cachesApi: fakeCaches(), fetchFn: f })).rejects.toMatchObject({ code: 'blocked' })
    expect(f).not.toHaveBeenCalled()
  })
  it('скачали → сохранили; повторный запуск берёт из кеша без запросов', async () => {
    const c = fakeCaches()
    const f = fetchOk()
    const a = await getModel(URL1, { cachesApi: c, fetchFn: f, allowNetwork: true })
    expect(a).toMatchObject({ from: 'network', size: 40, kind: 'gzip', saveError: null })
    expect(f).toHaveBeenCalledTimes(1)
    expect((await peekCached(URL1, c)).size).toBe(40)
    const b = await getModel(URL1, { cachesApi: c, fetchFn: f, allowNetwork: false })
    expect(b).toMatchObject({ from: 'cache', size: 40 })
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('в кеш не влезло — модель всё равно отдаётся, ошибка в saveError', async () => {
    const c = fakeCaches({ putError: Object.assign(new Error('full'), { name: 'QuotaExceededError' }) })
    const r = await getModel(URL1, { cachesApi: c, fetchFn: fetchOk(), allowNetwork: true })
    expect(r.from).toBe('network')
    expect(r.saveError.code).toBe('quota')
    expect(r.blob.size).toBe(40)
  })
  it('в кеш не кладём мусор: не архив → ошибка, кеш пуст', async () => {
    const c = fakeCaches()
    const junk = vi.fn(async () => fakeResponse([new Uint8Array(40).fill(3)], { headers: { 'content-length': '40' } }))
    await expect(getModel(URL1, { cachesApi: c, fetchFn: junk, allowNetwork: true })).rejects.toMatchObject({ code: 'format' })
    expect(await peekCached(URL1, c)).toBeNull()
    const page = vi.fn(async () => fakeResponse([new TextEncoder().encode('<!doctype html><html>')], {}))
    await expect(getModel(URL1, { cachesApi: c, fetchFn: page, allowNetwork: true })).rejects.toMatchObject({ code: 'html' })
  })
  it('неполная загрузка в кеш не попадает', async () => {
    const c = fakeCaches()
    const f = vi.fn(async () => fakeResponse(slices(gzBytes(30), 10), { headers: { 'content-length': '40' } }))
    await expect(getModel(URL1, { cachesApi: c, fetchFn: f, allowNetwork: true, sleep: noSleep })).rejects.toMatchObject({ code: 'incomplete' })
    expect(await peekCached(URL1, c)).toBeNull()
  })
})
