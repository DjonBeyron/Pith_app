import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { wholeRows, voiceCount, missingRows } from './raceVoiceTable.js'
import { PHRASE_FIXTURE } from '../../pitrace/racePhraseFixture.js'
import RaceVoiceTable from './RaceVoiceTable.jsx'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'

// «Озвучка Пита» → группа «Фразы целиком»: английская фраза плана одной записью (word_audio, ключ phrase:<normText>, generateWordAudio — голос диктора слов).
const plan = { ...fixturePlan('three'), game: 'race', phrases: PHRASE_FIXTURE }
const phraseKey = t => `phrase:${t.toLowerCase()}`
const map = new Map([['phrase:nice to meet you', { url: 'r2/nice.mp3', duration: 1.27 }]])

describe('фразы целиком в таблице озвучки', () => {
  it('строка на каждую фразу плана: ключ phrase:…, текст не правится, статус и длительность по библиотеке word_audio', () => {
    const rows = wholeRows(plan, map)
    expect(rows.map(r => r.id)).toEqual(PHRASE_FIXTURE.map(p => phraseKey(p.text)))
    expect(rows[0]).toMatchObject({ group: 'whole', key: 'phrase:nice to meet you', text: 'Nice to meet you', status: 'ok', duration: 1.27, editable: false })
    expect(rows.slice(1).every(r => r.status === 'none' && r.duration === null)).toBe(true)
    expect(wholeRows(null, map)).toEqual([])
  })
  it('попадают в «озвучено N из M», «Озвучить недостающие» и «Переозвучить все»', () => {
    const rows = wholeRows(plan, map)
    expect(voiceCount(rows)).toEqual({ done: 1, total: PHRASE_FIXTURE.length })
    expect(missingRows(rows).map(r => r.text)).toEqual(PHRASE_FIXTURE.slice(1).map(p => p.text))
    const src = readFileSync(new URL('./RaceVoiceTable.jsx', import.meta.url), 'utf8')
    expect(src).toContain('const all = [...whole, ...lines, ...meanings, ...trans]')
  })
  it('развёрнутая таблица показывает группу «Фразы целиком» с кнопкой «Озвучить»', () => {
    const deps = { cachedLines: () => ({ lines: {} }), loadLines: async () => ({ lines: {} }), loadMeanings: async () => ({}) }
    const html = renderToStaticMarkup(createElement(RaceVoiceTable, { plan, open: true, onToggle() {}, deps }))
    expect(html).toContain('>Фразы целиком<'); expect(html).toContain('data-testid="rv-whole"')
    expect(html).toContain(`data-testid="rv-row-${phraseKey('Where are you from')}"`)
  })
  it('озвучка — тем же путём, что слова (generateWordAudio по ключу строки phrase:…), ошибка фразы — в её строке', () => {
    const src = readFileSync(new URL('./useRaceVoiceTable.js', import.meta.url), 'utf8')
    expect(src).toContain('const keyOf = r => r.key ?? transKey(r.text)'); expect(src).toContain('words.map(r => ({ key: keyOf(r), text: r.text, has: false }))')
  })
})
