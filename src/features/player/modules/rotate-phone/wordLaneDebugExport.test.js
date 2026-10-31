import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createWordLaneDebug, NO_DEBUG } from './wordLaneDebug.js'
import { debugFileName, blobToBase64, prepareAudio, buildDebugFile, saveDebugFile } from './wordLaneDebugExport.js'
import { pickMime, armSpy, createDebugRecorder, describeStream } from './wordLaneDebugRecorder.js'
import WordLaneDebugButton from './WordLaneDebugButton.jsx'

// «Скачать отладку», часть 2: файл выгрузки (json + аудио в base64), скачивание / «Поделиться» / вкладка, запись микрофона на поддельном MediaRecorder, кнопка в финале.
const fromBase64 = b => new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0)))

describe('файл выгрузки', () => {
  it('имя: pithy-dictor-debug-<дата-время>.json', () => {
    expect(debugFileName(new Date(2026, 9, 29, 14, 5, 3))).toBe('pithy-dictor-debug-2026-10-29_14-05-03.json')
  })
  it('blobToBase64 без префикса data:, prepareAudio собирает части записи', async () => {
    expect(fromBase64(await blobToBase64(new Blob(['привет'], { type: 'audio/webm' })))).toBe('привет')
    const rec = { parts: () => [{ mime: 'audio/webm;codecs=opus', startedAtMs: 123, blob: new Blob(['abc']) }, { mime: 'audio/webm', startedAtMs: 456, blob: new Blob(['de']) }] }
    const parts = await prepareAudio(rec)
    expect(parts.map(p => [p.mime, p.startedAtMs, fromBase64(p.base64)])).toEqual([['audio/webm;codecs=opus', 123, 'abc'], ['audio/webm', 456, 'de']])
    expect(await prepareAudio(null)).toEqual([])
  })
  it('buildDebugFile: журнал + userSaid + audio { mime, base64, startedAtMs }; лишние части — audioMore', async () => {
    const log = createWordLaneDebug({ enabled: true, now: () => 5000 })
    log.meta({ phrase: 'try' }); log.event('x')
    const audio = [{ mime: 'audio/mp4', base64: 'QUJD', startedAtMs: 4000 }, { mime: 'audio/mp4', base64: 'REU=', startedAtMs: 4500 }]
    const f = buildDebugFile({ log, audio, userSaid: '  я сказал try  ', now: new Date(2026, 9, 29, 1, 2, 3) })
    const body = JSON.parse(f.json)
    expect(f.name).toBe('pithy-dictor-debug-2026-10-29_01-02-03.json')
    expect(body).toMatchObject({ version: 1, phrase: 'try', userSaid: 'я сказал try', audioParts: 2, audio: { mime: 'audio/mp4', base64: 'QUJD', startedAtMs: 4000 }, audioMore: [{ base64: 'REU=' }] })
    expect(body.events[0]).toMatchObject({ type: 'event', kind: 'x' })
    expect(await f.blob.text()).toBe(f.json)
    const none = JSON.parse(buildDebugFile({ log, audio: [] }).json)
    expect(none.audio).toBeNull()
    expect(none.audioMore).toBeUndefined()
  })
})

describe('режим звука в выгрузке', () => {
  it('buildDebugFile: audioMode { id, launched, title, custom, line } по настройкам микрофона игры из журнала (пресет C или свой набор)', () => {
    const mk = game => createWordLaneDebug({ enabled: true, now: () => 5000, describeMic: () => ({ game }) })
    const c = JSON.parse(buildDebugFile({ log: mk({ open: true, processing: false, audioSessionMode: 'play-and-record', micHoldMode: 'close' }) }).json)
    expect(c.audioMode).toMatchObject({ id: 'C', custom: false, line: 'C — Запись+воспр., закрывать микрофон на речь Пита' })
    const odd = JSON.parse(buildDebugFile({ log: mk({ open: true, processing: true, audioSessionMode: 'auto', micHoldMode: 'none' }) }).json)
    expect(odd.audioMode).toMatchObject({ id: 'custom', custom: true }); expect(odd.audioMode.line).toContain('свой набор')
  })
})

describe('отдать файл', () => {
  const file = { name: 'x.json', blob: new Blob(['{}']), json: '{}' }
  const env = (over = {}) => {
    const a = { click: vi.fn(), remove: vi.fn(), style: {} }
    return {
      a,
      doc: { createElement: () => a, body: { appendChild: vi.fn() } },
      nav: { userAgent: 'Mozilla/5.0 (Linux; Android 13)' },
      win: { open: vi.fn(() => ({})) },
      urlApi: { createObjectURL: () => 'blob:abc', revokeObjectURL: vi.fn() },
      setTimer: () => 0,
      ...over,
    }
  }
  it('обычный браузер: <a download> с именем файла', async () => {
    const e = env()
    expect(await saveDebugFile(file, e)).toBe('download')
    expect(e.a.download).toBe('x.json')
    expect(e.a.href).toBe('blob:abc')
    expect(e.a.click).toHaveBeenCalled()
  })
  it('iPhone: «Поделиться» с файлом; отмена — cancelled; нет share — blob в новой вкладке', async () => {
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    const share = vi.fn(async () => {})
    const e1 = env({ nav: { userAgent: ios, canShare: () => true, share } })
    expect(await saveDebugFile(file, e1)).toBe('share')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [file.blob] }))
    expect(e1.a.click).not.toHaveBeenCalled()
    const e2 = env({ nav: { userAgent: ios, canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } } })
    expect(await saveDebugFile(file, e2)).toBe('cancelled')
    const e3 = env({ nav: { userAgent: ios } })
    expect(await saveDebugFile(file, e3)).toBe('tab')
    expect(e3.win.open).toHaveBeenCalledWith('blob:abc', '_blank')
  })
  it('ничего не вышло — failed, исключение наружу не летит', async () => {
    const e = env({ nav: { userAgent: 'iPhone' }, win: { open: () => null } })
    expect(await saveDebugFile(file, e)).toBe('failed')
  })
})

describe('запись микрофона', () => {
  class FakeMR {
    static types = ['audio/webm;codecs=opus', 'audio/mp4']
    static isTypeSupported = m => FakeMR.types.includes(m)
    static made = []
    constructor(stream, opts) { this.stream = stream; this.opts = opts; this.state = 'inactive'; FakeMR.made.push(this) }
    start(slice) { this.state = 'recording'; this.slice = slice; this.onstart?.(); this.ondataavailable?.({ data: new Blob(['aa']) }) }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['bb']) }); setTimeout(() => this.onstop?.(), 0) }
  }
  const stream = () => { const tr = { readyState: 'live', muted: false, enabled: true, label: 'mic', getSettings: () => ({ echoCancellation: false }) }; return { getAudioTracks: () => [tr], tr } }
  const mk = (over = {}) => { FakeMR.made = []; const log = createWordLaneDebug({ enabled: true, now: () => 0 }); return { log, rec: createDebugRecorder({ log, MR: FakeMR, md: null, ...over }) } }

  it('формат: webm/opus, иначе mp4 (iOS Safari), иначе нет записи', () => {
    expect(pickMime(FakeMR)).toBe('audio/webm;codecs=opus')
    FakeMR.types = ['audio/mp4']; expect(pickMime(FakeMR)).toBe('audio/mp4')
    FakeMR.types = []; expect(pickMime(FakeMR)).toBeNull()
    expect(pickMime(undefined)).toBeNull()
    FakeMR.types = ['audio/webm;codecs=opus', 'audio/mp4']
  })
  it('нет формата — записи нет, в журнале rec-unsupported (один раз)', () => {
    FakeMR.types = []
    const { log, rec } = mk({ getStream: stream })
    rec.attach(); rec.attach()
    expect(rec.supported).toBe(false)
    expect(log.dump().events.filter(e => e.kind === 'rec-unsupported')).toHaveLength(1)
    expect(rec.parts()).toEqual([])
    FakeMR.types = ['audio/webm;codecs=opus', 'audio/mp4']
  })
  it('пишет поток игры раз в секунду; тот же поток не перезапускает; stop дописывает и отдаёт часть', async () => {
    const s = stream()
    const { log, rec } = mk({ getStream: () => s, now: () => 7777 })
    rec.attach(); rec.attach()
    expect(FakeMR.made).toHaveLength(1)
    expect(FakeMR.made[0].slice).toBe(1000)
    expect(FakeMR.made[0].opts.mimeType).toBe('audio/webm;codecs=opus')
    await rec.stop()
    const parts = rec.parts()
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ mime: 'audio/webm;codecs=opus', startedAtMs: 7777, source: 'gameMic' })
    expect(await parts[0].blob.text()).toBe('aabb')
    const start = log.dump().events.find(e => e.kind === 'rec-start')
    expect(start).toMatchObject({ at: 7777, source: 'gameMic' })
    expect(start.tracks[0].settings).toEqual({ echoCancellation: false })
    rec.attach() // после stop — не пишет
    expect(FakeMR.made).toHaveLength(1)
  })
  it('нет игрового потока — берёт поток распознавателя, пойманный обёрткой getUserMedia, и не открывает свой', async () => {
    const real = stream()
    const orig = vi.fn(async () => real)
    const md = { getUserMedia: orig }
    const { rec } = mk({ md })
    rec.arm()
    expect(await md.getUserMedia({ audio: true })).toBe(real) // вызов и результат те же
    expect(orig).toHaveBeenCalledTimes(1)
    rec.attach()
    expect(FakeMR.made[0].stream).toBe(real)
    await rec.stop()
    expect(md.getUserMedia).toBe(orig) // обёртка снята
  })
  it('armSpy снимается: после unspy getUserMedia прежний', async () => {
    const orig = vi.fn(async () => stream())
    const md = { getUserMedia: orig }
    const seen = []
    const off = armSpy(md, s => seen.push(s))
    expect(md.getUserMedia).not.toBe(orig)
    await md.getUserMedia({})
    expect(seen).toHaveLength(1)
    off()
    expect(md.getUserMedia).toBe(orig)
    expect(describeStream(stream())[0]).toMatchObject({ label: 'mic', readyState: 'live' })
  })
})

describe('кнопка в финале', () => {
  const html = dbg => renderToStaticMarkup(createElement(WordLaneDebugButton, { dbg }))
  it('при выключенной отладке не рисуется вообще', () => {
    expect(html(NO_DEBUG)).toBe('')
    expect(html(undefined)).toBe('')
  })
  it('при включённой — серая ссылка «Скачать отладку» (пока запись готовится — «Готовлю запись…») и строка «что я говорил»', () => {
    const out = html({ enabled: true, prepare: () => new Promise(() => {}), dump: () => ({}) })
    expect(out).toContain('data-testid="wl-debug-save"')
    expect(out).toContain('data-testid="wl-debug-said"')
    expect(out).toContain('Готовлю запись')
    expect(out).toContain('disabled')
  })
  it('в игре кнопка стоит в финале рядом с «Дальше» и только при dbg.enabled', () => {
    const src = readFileSync(new URL('./WordLaneGame.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/phase === 'reveal'[\s\S]*wl-next[\s\S]*f\.dbg\.enabled && <WordLaneDebugButton dbg=\{f\.dbg\} \/>/)
  })
})
