import { describe, it, expect } from 'vitest'
import { audioPulse, audioDeep } from './gameAudioPulse.js'
import { journalTail, reportMicLoss } from './gameJournalMute.js'
import { createGameJournal } from './gameJournal.js'

const ctx = (state, t) => ({ state, currentTime: t, baseLatency: 0.01, outputLatency: 0.05, sampleRate: 24000 })
const nav = { audioSession: { type: 'playback', state: 'active' } }

describe('пульс звука для журнала', () => {
  it('часы контекста: ход ×1.00, а если стоят при state=running — «ЧАСЫ СТОЯТ»', () => {
    const c = ctx('running', 0); let w = 1000
    const p = () => audioPulse({ contexts: () => [{ kind: 'game', ctx: c }], mic: () => 'live', nav, wall: () => w })
    expect(p()).toBe('snd=game:running ses=playback/active mic=live') // первый замер — часов сравнить не с чем
    w = 2000; c.currentTime = 1
    expect(p()).toContain('game:running×1.00')
    w = 3000 // а часы не пошли
    expect(p()).toContain('ЧАСЫ СТОЯТ(×0.00)')
  })
  it('нет контекстов / нет API сессии / сбой источника — строка всё равно есть', () => {
    expect(audioPulse({ contexts: () => [], mic: () => { throw new Error('x') }, nav: {} })).toBe('snd=нет ses=нет API mic=—')
    expect(audioPulse({ contexts: () => { throw new Error('x') }, mic: () => 'нет потока', nav })).toContain('snd=—')
  })
  it('подробности: задержки вывода, играющие элементы, фокус, дорожка', () => {
    const doc = { visibilityState: 'visible', hasFocus: () => true, querySelectorAll: () => [{ tagName: 'VIDEO', paused: false, muted: true }, { tagName: 'AUDIO', paused: true }] }
    const stream = { getTracks: () => [{ label: 'iPhone Microphone', readyState: 'live', muted: true, enabled: false, getSettings: () => ({ sampleRate: 48000, deviceId: 'abcdef123' }) }] }
    const t = audioDeep({ contexts: () => [{ kind: 'game', ctx: ctx('running', 2.5) }], doc, nav, stream }).join('\n')
    expect(t).toContain('game: state=running, t=2.50, base=0.010, out=0.050, rate=24000')
    expect(t).toContain('медиа-элементов 2, играет 1 (video:muted)'); expect(t).toContain('фокус=да, visibility=visible')
    expect(t).toContain('«iPhone Microphone» live/muted/off, 48000 Гц, id abcdef')
  })
})

describe('разбор глушения микрофона', () => {
  const line = (t, text) => `${t.toFixed(1).padStart(9)} 12:00:00.000 ${text}`
  it('хвост: за окно, без [perf], не больше max, самые свежие', () => {
    const lines = [line(100, 'давно'), line(5000, '[mic-hold] on'), line(5500, '[perf] fps=60'), line(6000, '[mia] реплика hush'), line(6200, '[page] mute')]
    expect(journalTail(lines, 6200).map(l => l.replace(/^\S+ \S+ /, ''))).toEqual(['[mic-hold] on', '[mia] реплика hush', '[page] mute'])
    expect(journalTail(lines, 6200, { max: 1 })).toHaveLength(1)
  })
  it('reportMicLoss: пульс, подробности и «что было до» (хвост взят до своих строк)', () => {
    const j = createGameJournal({ now: () => 6200, clock: () => new Date(2026, 0, 1) })
    j.add('[mia] реплика boss_mia_hush: звук 1489 мс')
    reportMicLoss(j, 'mute', { now: () => 6200, pulse: () => 'snd=game:running×1.00', deep: () => ['game: state=running'] })
    const t = j.lines().map(l => l.slice(23)).join('\n')
    expect(t).toContain('[mute-разбор] дорожка заглушена: snd=game:running×1.00'); expect(t).toContain('[mute-разбор]   game: state=running')
    expect(t).toContain('что было за 3 с до этого (1 строк)'); expect(t).toContain('← 6200.0 00:00:00.000 [mia] реплика boss_mia_hush')
    expect(t).not.toContain('← [mute-разбор]')
  })
})
