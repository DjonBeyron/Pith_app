import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { speechWindows, rmsSeries, windowLevels, tickSummary, toDb } from '../../../../../scripts/dictorRms.mjs'

// Отчёт «Скачать отладку»: громкость записи микрофона по окнам речи диктора ("то громче, то тише") и сводка по аудиосессии
const P = (t, kind, d = {}) => ({ t, type: 'probe', kind, ...d })

describe('окна речи по событиям пробника', () => {
  it('<audio>: playing → ended/pause; speechSynthesis: start → end; стадия и заметка игры подписывают окно; незакрытое — до конца журнала', () => {
    const events = [
      { t: 0, type: 'stage', kind: 'dictor' },
      { t: 990, type: 'note', kind: 'dictor' },
      P(1000, 'play-call', { el: 3 }), P(1020, 'playing', { el: 3, src: 'blob:…abc' }), P(1800, 'ended', { el: 3 }), P(1801, 'pause', { el: 3 }),
      P(2500, 'speech-event', { id: 9, event: 'start' }), P(3100, 'speech-event', { id: 9, event: 'end' }),
      P(4000, 'playing', { el: 4, src: 'blob:…def' }), { t: 4600, type: 'stage', kind: 'student' },
    ]
    const w = speechWindows(events)
    expect(w).toHaveLength(3)
    expect(w[0]).toMatchObject({ from: 1020, to: 1800, kind: 'audio', stage: 'dictor', note: 'dictor' })
    expect(w[1]).toMatchObject({ from: 2500, to: 3100, kind: 'speech' })
    expect(w[2]).toMatchObject({ from: 4000, to: 4600, kind: 'audio' })
  })
})

describe('RMS записи по 100 мс', () => {
  const RATE = 16000
  const tone = (ms, amp) => Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => amp * Math.sin(i / 7))
  it('rmsSeries: громкий кусок выше тихого; windowLevels считает среднее, пик и тренд в окне (запись началась на startRel мс позже старта игры)', () => {
    const loud = tone(1000, 0.5), quiet = tone(1000, 0.05)
    const samples = new Float32Array(loud.length + quiet.length)
    samples.set(loud); samples.set(quiet, loud.length)
    const rms = rmsSeries(samples)
    expect(rms).toHaveLength(20)
    expect(rms[0]).toBeGreaterThan(rms[19] * 5)
    const rows = windowLevels([{ from: 5000, to: 6000 }, { from: 6000, to: 7000 }, { from: 99000, to: 99500 }], rms, 5000)
    expect(rows).toHaveLength(2)                         // окно вне записи пропущено
    expect(rows[0].meanDb).toBeGreaterThan(rows[1].meanDb + 15)
    expect(rows[0].series).toHaveLength(10)
    const ramp = windowLevels([{ from: 0, to: 2000 }], rms, 0)[0]
    expect(ramp.trendDb).toBeLessThan(-15)               // громкость падает внутри окна — «ныряет»
  })
  it('тишина — -100 дБ (дорожка выключена режимом «глушить»)', () => {
    expect(toDb(0)).toBe(-100)
    expect(windowLevels([{ from: 0, to: 500 }], rmsSeries(new Float32Array(RATE)), 0)[0].meanDb).toBe(-100)
  })
})

describe('сводка audio-tick', () => {
  it('типы сессии, видимость, громкость и моменты смены типа', () => {
    const events = [P(100, 'audio-tick', { as: 'play-and-record', vis: 'visible', els: [{ vol: 1 }] }), P(600, 'audio-tick', { as: 'play-and-record', vis: 'visible', els: [{ vol: 1 }] }), P(1100, 'audio-tick', { as: 'playback', vis: 'hidden', els: [{ vol: 0.5 }] })]
    expect(tickSummary(events)).toEqual({ ticks: 3, sessionTypes: { 'play-and-record': 2, playback: 1 }, visibility: { visible: 2, hidden: 1 }, volumes: { 1: 2, 0.5: 1 }, sessionChanges: [{ t: 100, as: 'play-and-record' }, { t: 1100, as: 'playback' }] })
  })
})

describe('отчёт scripts/dictor-debug-report.mjs показывает аудиосессию, mic-hold и окна речи', () => {
  it('на файле с событиями audio-session / mic-hold / audio-tick есть сводка; без записи RMS-раздел не падает', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dictor-rms-'))
    const f = join(dir, 'd.json')
    const events = [
      { t: -50, type: 'probe', kind: 'audio-session', mode: 'phases', why: 'begin', requested: 'play-and-record', ok: true, as: 'play-and-record', supported: true },
      P(10, 'mic-hold', { on: true, mode: 'enabled-false', enabled: false, muted: false, readyState: 'live' }),
      P(20, 'mic-hold', { on: false, check: true, mode: 'enabled-false', enabled: true, muted: false, readyState: 'live', dead: false }),
      P(30, 'audio-tick', { as: 'playback', vis: 'visible', els: [{ el: 1, vol: 1 }] }),
    ]
    writeFileSync(f, JSON.stringify({ version: 1, startedAt: 'x', startedAtMs: 0, phrase: 'a', chunks: ['a'], device: {}, mic: 'x', events }))
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('../../../../../scripts/dictor-debug-report.mjs', import.meta.url)), f, '--no-audio'], { encoding: 'utf8' })
    expect(out).toContain('Аудиосессия iOS и глушение дорожки')
    expect(out).toContain('audio-session: событий 1; режим phases')
    expect(out).toContain('mic-hold: событий 2; режим enabled-false; включений 1; не ожила после возврата: 0')
    expect(out).toContain('audio-tick (раз в 0,5 с, пока играет звук): 1')
  })
})
