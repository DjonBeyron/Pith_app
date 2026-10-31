import { describe, it, expect, vi } from 'vitest'
import { REHEARSAL_LINES, isStaleLine, lineVoiced } from './rehearsalLines.js'
import { normalizeLines, linesToSave, linesItems, lineKey } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { missingPitLines, pitVoiceCount, voiceMissingPitLines } from './rehearsalVoice.js'
import { actLineRows, actVoiceCount, unvoicedRows } from './polish/polishLines.js'

// v3.3.83: текст реплики репетиции в коде поменялся, а в настройках лежит старый текст со старой озвучкой — реплика устарела, её надо переозвучить (источник правды — код)
const fresh = id => REHEARSAL_LINES.find(l => l.id === id).text
const saved = { lines: {
  rh_warmup: { text: 'старый текст разминки', url: 'https://r2/old.mp3', duration: 3, words: [{ w: 'x', t: 0, e: 1 }] }, // текст в коде другой
  rh_read_why: { text: fresh('rh_read_why'), url: 'https://r2/read.mp3', duration: 2 },                            // актуальная
  your_turn: { text: 'Свой текст из редактора ноды', url: 'https://r2/yt.mp3', duration: 1 },                      // реплика игры — не трогаем
} }

describe('устаревшие реплики репетиции', () => {
  it('isStaleLine / lineVoiced: только rh_*, только непустой другой текст', () => {
    expect(isStaleLine('rh_warmup', 'старое')).toBe(true)
    expect(isStaleLine('rh_warmup', fresh('rh_warmup'))).toBe(false)
    expect(isStaleLine('rh_warmup', '  ')).toBe(false)
    expect(isStaleLine('your_turn', 'что угодно')).toBe(false)
    expect(lineVoiced('rh_warmup', { text: 'старое', url: 'u' })).toBe(false)
    expect(lineVoiced('rh_warmup', { url: 'u' })).toBe(true)
    expect(lineVoiced('rh_warmup', { text: fresh('rh_warmup') })).toBe(false)
  })
  it('normalizeLines: устаревшая — текст из кода, url / duration / words сброшены; актуальная и реплики игры — как были', () => {
    const l = normalizeLines(saved)
    expect(l.rh_warmup).toEqual({ text: fresh('rh_warmup'), url: null, duration: null, words: null })
    expect(l.rh_read_why).toMatchObject({ text: fresh('rh_read_why'), url: 'https://r2/read.mp3', duration: 2 })
    expect(l.your_turn).toMatchObject({ text: 'Свой текст из редактора ноды', url: 'https://r2/yt.mp3' })
  })
  it('игра не получает старый файл: в подготовку звука устаревшая реплика не попадает', () => {
    const keys = linesItems(normalizeLines(saved)).map(i => i.key)
    expect(keys).not.toContain(lineKey('rh_warmup')); expect(keys).toContain(lineKey('rh_read_why')); expect(keys).toContain(lineKey('your_turn'))
  })
  it('missingPitLines и счётчик: устаревшая — не озвучена, актуальная — озвучена; не-rh не считаются; сырые (ненормализованные) настройки дают тот же ответ', () => {
    for (const lines of [normalizeLines(saved), saved.lines]) {
      const ids = missingPitLines(lines).map(m => m.id)
      expect(ids).toContain('rh_warmup'); expect(ids).not.toContain('rh_read_why')
      expect(missingPitLines(lines).find(m => m.id === 'rh_warmup').text).toBe(fresh('rh_warmup'))
      expect(pitVoiceCount(lines).done).toBe(1)
    }
  })
  it('шлифовка: карточка показывает текст из кода и считает устаревшую неозвученной', () => {
    const lines = normalizeLines(saved)
    const w = actLineRows('warmup', lines).find(r => r.id === 'rh_warmup')
    expect(w).toMatchObject({ text: fresh('rh_warmup'), url: null, state: 'missing' })
    expect(actVoiceCount('read', lines)).toMatchObject({ done: 1 })
    expect(actVoiceCount('warmup', lines).done).toBe(0)
    expect(unvoicedRows(lines).map(r => r.id)).toContain('rh_warmup')
  })
  it('переозвучка: говорит новый текст, в настройки уходит новый текст с новым url; актуальные и реплики игры не перезаписываются', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const spoken = []; const out = []
    await voiceMissingPitLines({ load: async () => saved, speak: async t => { spoken.push(t); return { file: { text: t }, wordTimings: [] } }, upload: async f => `new/${f.text.length}`, probe: async () => 1, save: async v => out.push(v) })
    vi.restoreAllMocks()
    expect(spoken).toContain(fresh('rh_warmup')); expect(spoken).not.toContain('старый текст разминки'); expect(spoken).not.toContain(fresh('rh_read_why'))
    const s = out[0].lines
    expect(s.rh_warmup).toMatchObject({ text: fresh('rh_warmup'), url: `new/${fresh('rh_warmup').length}` })
    expect(s.rh_read_why.url).toBe('https://r2/read.mp3'); expect(s.your_turn.text).toBe('Свой текст из редактора ноды')
    expect(pitVoiceCount(normalizeLines(out[0])).done).toBe(pitVoiceCount(normalizeLines(out[0])).total)
  })
  it('linesToSave без переозвучки не тащит устаревший текст и url обратно в настройки', () => {
    expect(linesToSave(normalizeLines(saved)).lines.rh_warmup).toBeUndefined()
  })
})
