import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { normalizeLines, linesToSave, playableLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { lineVoiced } from '../../rehearsal/rehearsalLines.js'
import { voicePitLines, missingPitLines } from '../../rehearsal/rehearsalVoice.js'
import { lineStatus, lineRows, meaningVoiceRows, sceneVoiceRows, transVoiceRows, voiceCount, missingRows, durLabel } from './raceVoiceTable.js'
import { editedLine, saveLineText } from './raceLineText.js'
import { mainRaceMode, mainRaceTitle } from './raceMainMode.js'
import { askText } from '../../pitrace/raceAskVoice.js'
import { RACE_TITLES, STAGES_ROUND } from '../../pitrace/raceOnly.js'
import { MIA_LINES } from '../../pitrace/mia/miaLines.js'
import RaceVoiceTable from './RaceVoiceTable.jsx'
import { RaceAskScene } from '../../pitrace/RaceAskPlate.jsx'
import RaceBlockLazy from './RaceBlock.jsx'

vi.mock('../../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) }))

// «Озвучка Пита» (Админ → «Голос» → «Встряхни память»): статусы реплик, правка текста главнее каталога, переозвучка, рендер таблицы и новый вид блока.
const [A, B, C] = RACE_LINES
const raw = { lines: {
  [A.id]: { text: A.text, url: 'u/a.mp3', duration: 2.34 },                                // озвучено
  [B.id]: { text: 'новый текст', url: 'u/b.mp3', duration: 1, custom: true, said: B.text }, // текст изменён после озвучки
} } // C — нет озвучки
const deps = { cachedLines: () => raw, loadLines: async () => raw, loadMeanings: async () => ({}) }
const html = props => renderToStaticMarkup(createElement(RaceVoiceTable, { plan: null, open: true, onToggle() {}, deps, ...props }))

describe('статусы и правка текста', () => {
  it('три статуса: озвучено / нет озвучки / текст изменён после озвучки', () => {
    const l = normalizeLines(raw)
    expect(lineStatus(l[A.id])).toBe('ok'); expect(lineStatus(l[B.id])).toBe('changed'); expect(lineStatus(l[C.id])).toBe('none')
    const rows = lineRows(RACE_LINES, l)
    expect(rows.map(r => r.id)).toEqual(RACE_LINES.map(r => r.id)) // все реплики каталога, динамически
    expect(voiceCount(rows)).toEqual({ done: 1, total: RACE_LINES.length }); expect(missingRows(rows)).toHaveLength(RACE_LINES.length - 1)
    expect(durLabel(2.34)).toBe('2,3 с'); expect(durLabel(null)).toBe('')
  })
  it('сохранённый в админке текст (custom) главнее каталога: не сбрасывается как устаревший, игра берёт его; озвучка не считается актуальной до переозвучки', () => {
    const l = normalizeLines(raw)
    expect(l[B.id].text).toBe('новый текст'); expect(l[B.id].url).toBe('u/b.mp3'); expect(lineVoiced(B.id, l[B.id])).toBe(false)
    expect(missingPitLines(l, RACE_LINES).find(x => x.id === B.id).text).toBe('новый текст')
    expect(linesToSave(l).lines[B.id]).toMatchObject({ text: 'новый текст', custom: true, said: B.text })
    expect(normalizeLines({ lines: { [B.id]: { text: 'новый текст', url: 'x' } } })[B.id].url).toBeNull() // без custom — прежнее правило устаревания
    expect(editedLine(l[A.id], ' правка ')).toMatchObject({ text: 'правка', custom: true, said: A.text, url: 'u/a.mp3' })
    expect(askText(normalizeLines({ lines: { race_ask_voice: { text: 'Голосом или пальцами?', custom: true } } }))).toBe('Голосом или пальцами?')
  })
  it('игра: поправленная без переозвучки реплика звучит подписью нового текста, старый файл не играет; плашка-вопрос показывает сохранённый текст', () => {
    const g = playableLines(normalizeLines(raw))
    expect(g[B.id]).toMatchObject({ text: 'новый текст', url: null }); expect(g[A.id].url).toBe('u/a.mp3')
    expect(renderToStaticMarkup(createElement(RaceAskScene, { choice: 'voice', onPick() {}, onCancel() {}, text: 'Свой вопрос' }))).toContain('>Свой вопрос<')
    expect(readFileSync(new URL('../../player/modules/rotate-phone/RotatePhoneModule.jsx', import.meta.url), 'utf8')).toContain('setLines(playableLines(normalizeLines(raw)))')
  })
  it('saveLineText пишет custom; voicePitLines переозвучивает текущим текстом и пишет said, ошибка одной не мешает другим', async () => {
    const save = vi.fn(async v => v)
    const after = await saveLineText(C.id, 'другая реплика', { load: async () => raw, save })
    expect(after[C.id]).toMatchObject({ text: 'другая реплика', custom: true }); expect(save.mock.calls[0][0].lines[C.id].custom).toBe(true)
    await expect(saveLineText(C.id, '  ', { load: async () => raw, save })).rejects.toThrow()
    const speak = vi.fn(async text => { if (text === A.text) throw new Error('квота'); return { file: new Blob(['x']), wordTimings: [] } })
    globalThis.URL.createObjectURL ??= () => 'blob:x'; globalThis.URL.revokeObjectURL ??= () => {}
    const saved = vi.fn(async v => v)
    const res = await voicePitLines({ ids: [A.id, B.id], speak, upload: async () => 'u/new.mp3', probe: async () => 1.5, load: async () => raw, save: saved })
    expect(res.done).toBe(1); expect(res.failed[A.id]).toBe('квота')
    expect(speak).toHaveBeenCalledWith('новый текст')
    expect(saved.mock.calls[0][0].lines[B.id]).toMatchObject({ url: 'u/new.mp3', said: 'новый текст', duration: 1.5 })
    expect(lineStatus(normalizeLines(saved.mock.calls[0][0])[B.id])).toBe('ok')
  })
  it('смыслы фраз и переводы слов — отдельными группами, переводы без повторов смыслов и только чтение', () => {
    const plan = { words: [{ text: 'cat', translation: 'кот' }], extraWords: [], chunks: [], phrases: [{ key: 'hi there', text: 'Hi there', ru: 'поздоровайся' }] }
    const lib = new Map([['ru:кот', { url: 'u', duration: 0.5 }]])
    const m = meaningVoiceRows(plan, { 'hi there': 'скажи привет' }, lib)
    expect(m).toEqual([expect.objectContaining({ id: 'hi there', label: 'Hi there', text: 'скажи привет', status: 'none', editable: true })])
    const t = transVoiceRows(plan, m, lib)
    expect(t[0].text).toBe('кот'); expect(t.map(r => r.text)).not.toContain('скажи привет'); expect(t[0]).toMatchObject({ status: 'ok', editable: false })
  })
  it('ситуации (круг 1) — своей группой: id scene:<ключ>, сохранённая главнее плана, озвучка по ru:…, не повторяются в переводах', () => {
    const plan = { words: [{ text: 'cat', translation: 'кот' }], extraWords: [], chunks: [], phrases: [{ key: 'hi there', text: 'Hi there', ru: 'поздоровайся', scene: 'ты встречаешь друга' }, { key: 'bye', text: 'Bye', ru: 'попрощайся' }] }
    const lib = new Map([['ru:ты на улице', { url: 'u', duration: 1.1 }]])
    const s = sceneVoiceRows(plan, { 'hi there': 'ты на улице' }, lib)
    expect(s[0]).toMatchObject({ id: 'scene:hi there', phrase: 'hi there', group: 'scene', label: 'Hi there', text: 'ты на улице', status: 'ok', duration: 1.1, editable: true })
    expect(s[1]).toMatchObject({ id: 'scene:bye', text: '', status: 'none' }) // пустую можно вписать; в счёт озвучки не идёт
    expect(voiceCount(s)).toEqual({ done: 1, total: 1 })
    expect(sceneVoiceRows(plan, {}, null)[0].text).toBe('ты встречаешь друга')
    const m = meaningVoiceRows(plan, {}, lib), t = transVoiceRows(plan, [...m, ...s], lib)
    expect(t.map(r => r.text)).toContain('кот'); expect(t.map(r => r.text)).not.toContain('ты на улице'); expect(t.map(r => r.text)).not.toContain('поздоровайся')
  })
})

describe('таблица и блок', () => {
  it('развёрнута: счётчик, кнопки «Озвучить недостающие» и «Переозвучить все», статусы трёх видов, кнопка в строке', () => {
    const h = html()
    expect(h).toContain(`Озвучено 1 из ${RACE_LINES.length}`); expect(h).toContain('data-testid="rv-voice-missing"'); expect(h).toContain(`Озвучить недостающие (${RACE_LINES.length - 1})`)
    expect(h).toContain('data-testid="rv-voice-all"'); expect(h).toContain('>Переозвучить все<')
    for (const s of ['>озвучено<', '>нет озвучки<', '>текст изменён после озвучки<']) expect(h).toContain(s)
    expect(h.match(/data-testid="rv-row-/g)).toHaveLength(RACE_LINES.length + MIA_LINES.length); expect(h.match(/data-testid="rv-voice"/g)).toHaveLength(RACE_LINES.length + MIA_LINES.length) // + группа «Эпизод Мия» (v3.3.230)
    expect(h).toContain('value="новый текст"'); expect(h).toContain('>Переозвучить<'); expect(h).toContain('>Озвучить<')
  })
  it('свёрнута по умолчанию: только заголовок «Озвучка Пита» и сводка', () => {
    const h = html({ open: false })
    expect(h).toContain('Озвучка Пита'); expect(h).toContain('aria-expanded="false"'); expect(h).toContain(`озвучено 1 из ${RACE_LINES.length}`); expect(h).not.toContain('rv-row-')
  })
  it('блок: сверху одна «Встряхни память» (режим по умолчанию), ниже «Озвучка Пита», всё прежнее — в свёрнутом «Старое (old), не в прод»', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} })
    let h; try { h = renderToStaticMarkup(createElement(RaceBlockLazy)) } finally { vi.unstubAllGlobals() }
    const at = id => h.indexOf(`data-testid="${id}"`)
    expect(at('race-run-main')).toBeGreaterThan(0); expect(h).toContain('>Встряхни память<'); expect(at('race-run-main')).toBeLessThan(at('race-voice')); expect(at('race-voice')).toBeLessThan(at('race-old'))
    expect(h).toContain('Старое (old), не в прод'); for (const id of ['race-run-stages', 'race-run-full', 'race-export', 'race-settings']) expect(h).not.toContain(`data-testid="${id}"`)
    expect(mainRaceTitle()).toBe(RACE_TITLES[STAGES_ROUND]) // нет defaultRaceMode() в raceOnly.js — режим этапов (какой он — решает движок)
    expect(mainRaceMode({ defaultRaceMode: () => 'x', RACE_TITLES: { x: 'X' } })).toBe('x'); expect(mainRaceMode({ RACE_TITLES: { a: 'A' } })).toBe('a')
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(['race-old', 'race-voice']), setItem() {} })
    try { h = renderToStaticMarkup(createElement(RaceBlockLazy)) } finally { vi.unstubAllGlobals() }
    for (const id of ['race-run-stages', 'race-run-full', 'race-export', 'race-settings', 'rv-lines']) expect(h).toContain(`data-testid="${id}"`) // раскрытый old — всё прежнее на месте
    expect(readFileSync(new URL('../../../styles/admin-race-ask.css', import.meta.url), 'utf8')).toContain("@import './admin-race-voice.css'")
  })
})
