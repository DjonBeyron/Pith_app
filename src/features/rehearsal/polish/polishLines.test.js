import { describe, it, expect, vi } from 'vitest'
import { ACT_LINES, allLineRows, actLineRows, actVoiceCount, unvoicedRows, chunkCount, TEMPLATE_WHY, MISSING_WHY } from './polishLines.js'
import { REHEARSAL_LINES, REHEARSAL_LINE_IDS } from '../rehearsalLines.js'
import { ONLY_IDS } from '../rehearsalOnly.js'
import { buildActs } from '../rehearsalRecipe.js'
import { fixturePlan } from '../rehearsalFixtures.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { missingPitLines, pitVoiceCount, voiceMissingPitLines, voiceMissingTexts } from '../rehearsalVoice.js'

// Реплики Пита по этапам «Шлифовки»: какие реплики на каком этапе, «озвучено 2/3», что без озвучки и почему
const voiced = ids => normalizeLines({ lines: Object.fromEntries(ids.map(id => [id, { text: REHEARSAL_LINES.find(l => l.id === id).text, url: `u/${id}.mp3`, duration: 2 }])) })

describe('реплики по этапам', () => {
  it('каждая реплика репетиции стоит ровно на одном этапе; этапы — те же, что карточки', () => {
    expect(Object.keys(ACT_LINES)).toEqual(ONLY_IDS)
    const all = Object.values(ACT_LINES).flat()
    expect([...all].sort()).toEqual([...REHEARSAL_LINE_IDS].sort())
    expect(new Set(all).size).toBe(all.length)
  })
  it('соответствует рецепту: реплика акта (line / passes.line) стоит на этапе этого акта', () => {
    const { acts } = buildActs(fixturePlan('three'), { only: null })
    const actOf = { warmup: 'warmup', word: 'warmup', read: 'read', build: 'build', blind: 'blind', discern: 'discern', take: 'take', mirror: 'take' }
    for (const a of acts) {
      const ids = [a.line, ...(a.final?.passes ?? []).map(p => p.line)].filter(Boolean)
      for (const id of ids) expect(ACT_LINES[actOf[a.id]], `${a.id} → ${id}`).toContain(id)
    }
    expect(ACT_LINES.intro).toEqual(['rh_start']); expect(ACT_LINES.summary).toEqual(['rh_done']); expect(ACT_LINES.blind).toContain('rh_blind_hint'); expect(ACT_LINES.warmup).toContain('rh_warmup_miss')
  })
  it('состояния: озвучена (url), нет озвучки, со {word} — не озвучивается (с причиной)', () => {
    const rows = allLineRows(voiced(['rh_start', 'rh_build']))
    const by = Object.fromEntries(rows.map(r => [r.id, r]))
    expect(by.rh_start).toMatchObject({ state: 'ok', url: 'u/rh_start.mp3', why: '' })
    expect(by.rh_read_why).toMatchObject({ state: 'missing', url: null, why: MISSING_WHY })
    expect(by.rh_blind_hint).toMatchObject({ state: 'template', template: true, why: TEMPLATE_WHY })
    expect(TEMPLATE_WHY).toContain('{word} не озвучивается'); expect(rows).toHaveLength(REHEARSAL_LINES.length)
  })
  it('счётчик этапа: «озвучено 2/3»; реплика со {word} в счёт не входит и считается отдельно', () => {
    const lines = voiced(['rh_build', 'rh_clear', 'rh_blind'])
    expect(actVoiceCount('build', lines)).toEqual({ done: 2, total: 3, templates: 0 })
    expect(actVoiceCount('blind', lines)).toEqual({ done: 1, total: 1, templates: 1 })
    expect(actVoiceCount('intro', lines)).toEqual({ done: 0, total: 1, templates: 0 })
    expect(actLineRows('take', lines).map(r => r.id)).toEqual(['rh_take', 'rh_mirror'])
    expect(actVoiceCount('build', null)).toEqual({ done: 0, total: 3, templates: 0 })
  })
  it('общий счётчик «озвучено N из M» совпадает с pitVoiceCount; список «без озвучки» = недостающие + шаблонные', () => {
    const lines = voiced(['rh_start', 'rh_warmup', 'rh_take'])
    const c = pitVoiceCount(lines)
    expect(c).toEqual({ done: 3, total: REHEARSAL_LINES.length - 1 })
    const rest = unvoicedRows(lines)
    expect(rest.map(r => r.id)).toEqual(expect.arrayContaining(missingPitLines(lines).map(m => m.id)))
    expect(rest).toHaveLength(missingPitLines(lines).length + 1); expect(rest.find(r => r.state === 'template').id).toBe('rh_blind_hint')
    expect(unvoicedRows(voiced(REHEARSAL_LINE_IDS.filter(id => id !== 'rh_blind_hint')))).toHaveLength(1)
  })
  it('куски и слова плана: сколько озвучено среди тех, что озвучиваются библиотекой слов', () => {
    expect(chunkCount([{ key: 'a', has: true }, { key: 'b', has: false }, { key: null, has: false }])).toEqual({ done: 1, total: 2 })
    expect(chunkCount([])).toEqual({ done: 0, total: 0 })
  })
})

describe('озвучка из блока', () => {
  it('voiceMissingTexts: озвучивает только куски без озвучки через generate(key, text); ошибка одного не останавливает остальные', async () => {
    const rows = [{ key: 'a', text: 'A', has: true }, { key: 'b', text: 'B', has: false }, { key: null, text: 'ы', has: false }, { key: 'c', text: 'C', has: false }]
    const steps = []
    const generate = vi.fn(async key => { if (key === 'b') throw new Error('нет прав') })
    const r = await voiceMissingTexts(rows, generate, k => steps.push(k))
    expect(generate.mock.calls.map(c => c.join(':'))).toEqual(['b:B', 'c:C']); expect(steps).toEqual(['b', 'c'])
    expect(r).toEqual({ done: 1, failed: { b: 'нет прав' } })
  })
  it('voiceMissingPitLines: реплика не получилась (нет прав) — озвученные до неё сохраняются, ошибка уходит наверх', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const saved = []
    let n = 0
    const p = voiceMissingPitLines({
      load: async () => ({ lines: {} }), speak: async text => { if (++n === 3) throw new Error('ElevenLabs 401'); return { file: { text }, wordTimings: [] } },
      upload: async f => `r2://${f.text.length}`, probe: async () => 1, save: async v => { saved.push(v) },
    })
    await expect(p).rejects.toThrow('ElevenLabs 401')
    vi.restoreAllMocks()
    expect(saved).toHaveLength(1)
    const urls = Object.values(saved[0].lines).filter(l => l.url)
    expect(urls).toHaveLength(2)
  })
  it('шаги озвучки: onStep получает id реплики (для «озвучиваю rh_start…»)', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const steps = []
    await voiceMissingPitLines({ load: async () => ({ lines: {} }), speak: async t => ({ file: { text: t } }), upload: async () => 'u', probe: async () => 1, save: async () => {}, onStep: id => steps.push(id) })
    vi.restoreAllMocks()
    expect(steps[0]).toBe('rh_start'); expect(steps).not.toContain('rh_blind_hint'); expect(steps).toHaveLength(REHEARSAL_LINES.length - 1)
  })
})
