import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceVoiceTable from './RaceVoiceTable.jsx'
import { miaRows, lineRows } from './raceVoiceTable.js'
import { MIA_LINES } from '../../pitrace/mia/miaLines.js'

// «Озвучка Пита»: группа «Эпизод Мия» (v3.3.230): строки реплик Мии и Пита-в-эпизоде, свой счёт, кнопка «Озвучить Мию», остаток аккаунта Мии, ▶ у озвученных
const deps = { cachedLines: () => ({ lines: { mia_push: { text: 'Иди сюда, пушистик, дальше командую я', url: 'https://r2.dev/mia_push.mp3', duration: 2.1 } } }), loadLines: () => new Promise(() => {}), loadMeanings: () => new Promise(() => {}), loadScenes: () => new Promise(() => {}) }
const html = props => renderToStaticMarkup(createElement(RaceVoiceTable, { plan: null, open: true, onToggle() {}, deps, ...props }))

describe('группа «Эпизод Мия» в таблице озвучки', () => {
  it('строки реплик с пометкой голоса: Мия — второй аккаунт, Пит — обычный; у озвученной есть url для ▶', () => {
    const rows = miaRows(MIA_LINES, { mia_push: { text: 'x', url: 'u', duration: 1 } })
    expect(rows).toHaveLength(MIA_LINES.length); expect(rows.find(r => r.id === 'mia_push')).toMatchObject({ group: 'line', status: 'ok', url: 'u', label: expect.stringContaining('Мия') })
    expect(rows.find(r => r.id === 'pit_back_1').label).toContain('Пит'); expect(rows.find(r => r.id === 'mia_leave').url).toBeUndefined()
    expect(lineRows([{ id: 'a', text: 't', when: 'w' }], null)[0]).not.toHaveProperty('url')
  })
  it('развёрнутая таблица: группа Мии, свой счёт, кнопка «Озвучить Мию (N)», «Остаток аккаунта Мии», ▶ у озвученной; основной счёт не считает Мию', () => {
    const h = html()
    expect(h).toContain('Эпизод «Мия»'); expect(h).toContain('data-testid="rv-mia"'); expect(h).toMatch(new RegExp(`data-testid="rv-mia-count">Озвучено (<!-- -->)?1(<!-- -->)? из (<!-- -->)?${MIA_LINES.length}<`))
    expect(h).toContain('data-testid="rv-voice-mia"'); expect(h).toContain(`Озвучить Мию (${MIA_LINES.length - 1})`); expect(h).toContain('data-testid="rv-mia-quota-btn"')
    expect(h).toContain('data-testid="rv-row-mia_leave"'); expect(h).toContain('data-testid="rv-play"'); expect(h).toContain('второй аккаунт ElevenLabs')
    expect(h).toMatch(/data-testid="rv-count">Озвучено (<!-- -->)?0(<!-- -->)? из (<!-- -->)?\d+</) // основной счёт Пита Мию не считает (в нём 0: озвучена только mia_push)
  })
  it('озвучка реплик Мии идёт голосом Мии (generateSpeech получает account mia), реплик Пита — без голоса', async () => {
    const src = readFileSync(new URL('../../rehearsal/rehearsalVoice.js', import.meta.url), 'utf8')
    expect(src).toContain('voiceOf(id)'); expect(src).toContain('speak(text, voice)'); expect(src).toContain('{ speak, upload, probe }, id)')
    const { voicePitLines } = await import('../../rehearsal/rehearsalVoice.js')
    const speak = vi.fn(async () => ({ file: new File(['x'], 'a.mp3'), wordTimings: [] }))
    globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {}
    const saved = []
    const load = async () => ({ lines: {} }), save = async v => { saved.push(v) }
    const r = await voicePitLines({ ids: ['mia_push', 'pit_back_1'], speak, upload: async () => 'https://r2.dev/x.mp3', probe: async () => 1.5, load, save })
    expect(r.done).toBe(2)
    expect(speak.mock.calls[0]).toEqual(['Иди сюда, пушистик, дальше командую я', expect.objectContaining({ account: 'mia' })])
    expect(speak.mock.calls[1]).toEqual(['Спасибо за помощь, вот это у неё характер']) // Пит — голос по умолчанию, второго аргумента нет
    expect(Object.keys(saved[0].lines ?? saved[0])).toEqual(expect.arrayContaining(['mia_push', 'pit_back_1']))
  })
  it('«Остаток аккаунта Мии» берёт данные второго аккаунта', () => {
    expect(readFileSync(new URL('./RaceVoiceTable.jsx', import.meta.url), 'utf8')).toContain("(deps?.quota ?? getElevenLabsQuota)('mia')")
  })
})
