import { describe, it, expect } from 'vitest'
import { probeSceneAudio, isAudioType, probeLines } from './audioProbe.js'

// «Проверить звук» без сети: подделки fetch (HEAD) и <audio> (события по сценарию)
const URL_OK = 'https://pub-1.r2.dev/chat/a.mp3'
const res = (status, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => headers[k.toLowerCase()] ?? null } })
const fakeAudio = script => () => {
  const ls = {}
  const a = {
    duration: 2.4, error: null, src: '', preload: '',
    addEventListener(ev, fn) { ls[ev] = fn }, removeAttribute() {}, load() {},
  }
  Object.defineProperty(a, 'src', { set() { queueMicrotask(() => script(a, ev => ls[ev]?.())) }, get() { return '' } })
  return a
}
const timers = { setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 5)), clearTimeout }
const run = (fetchFn, script, url = URL_OK, timeoutMs = 8000) => probeSceneAudio(url, { fetchFn, makeAudio: fakeAudio(script), timers, timeoutMs })

describe('probeSceneAudio', () => {
  it('всё хорошо: 200 audio/mpeg + canplay → ok и одна строка с типом, размером и длительностью', async () => {
    const r = await run(async () => res(200, { 'content-type': 'audio/mpeg', 'content-length': '204800' }), (a, fire) => fire('canplay'))
    expect(r.ok).toBe(true)
    expect(r.lines).toEqual(['файл доступен и играет: audio/mpeg, 200 КБ, 2,4 с'])
  })
  it('403 → «закрыт публичный доступ бакета»; 404 → «файла нет (сирота?)»; прочее — HTTP N', async () => {
    const r403 = await run(async () => res(403), (a, fire) => { a.error = { code: 4 }; fire('error') })
    expect(r403.ok).toBe(false)
    expect(r403.lines[0]).toMatch(/403 — у бакета R2 закрыт публичный доступ/)
    expect(r403.lines[1]).toMatch(/не смог проиграть файл: источник не поддерживается/)
    const r404 = await run(async () => res(404), (a, fire) => { a.error = { code: 4 }; fire('error') })
    expect(r404.lines[0]).toMatch(/404 — файла нет в бакете/)
    const r500 = await run(async () => res(500), (a, fire) => { a.error = { code: 2 }; fire('error') })
    expect(r500.lines[0]).toBe('файл недоступен: HTTP 500')
  })
  it('CORS у бакета не настроен (fetch бросает) — не ошибка, если <audio> играет', async () => {
    const r = await run(async () => { throw new TypeError('Failed to fetch') }, (a, fire) => fire('loadedmetadata'))
    expect(r.http.corsBlocked).toBe(true)
    expect(r.ok).toBe(true)
    expect(r.lines).toEqual([expect.stringMatching(/CORS у бакета не настроен/), 'браузер декодирует файл (2,4 с)'])
  })
  it('Content-Type application/octet-stream — предупреждение (Safari может отказаться), ok=false', async () => {
    const r = await run(async () => res(200, { 'content-type': 'application/octet-stream' }), (a, fire) => fire('canplay'))
    expect(r.ok).toBe(false)
    expect(r.lines[0]).toMatch(/«application\/octet-stream» — не аудио/)
  })
  it('таймаут пробы и чужой домен', async () => {
    const r = await run(async () => res(200, { 'content-type': 'audio/mpeg' }), () => {}, 'https://evil.example/a.mp3', 10)
    expect(r.hostOk).toBe(false)
    expect(r.ok).toBe(false)
    expect(r.lines[0]).toMatch(/домен ссылки не из списка разрешённых/)
    expect(r.lines.at(-1)).toMatch(/не начал играть файл за 0 с/)
  })
  it('isAudioType / probeLines без HTTP-ошибок', () => {
    expect(isAudioType('audio/mpeg; charset=binary')).toBe(true)
    expect(isAudioType('video/mp4')).toBe(true)
    expect(isAudioType('application/octet-stream')).toBe(false)
    expect(isAudioType(null)).toBe(false)
    expect(probeLines({ hostOk: true, http: { ok: true, status: 200, contentType: 'audio/mpeg', size: null, corsBlocked: false }, media: { ok: true, duration: 1 }, timeoutMs: 8000 })).toEqual(['файл доступен и играет: audio/mpeg, 1 с'])
  })
})
