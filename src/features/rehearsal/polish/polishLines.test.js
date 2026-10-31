import { describe, it, expect, vi } from 'vitest'
import { POLISH_CARDS, FULL_ID, actAvailable, planForAct } from './polishActs.js'
import { ACT_LINES, allLineRows, actLineRows, actVoiceCount, unvoicedRows, chunkCount, TEMPLATE_WHY, MISSING_WHY } from './polishLines.js'
import { REHEARSAL_LINES, REHEARSAL_LINE_IDS, lineVariants, baseLineId } from '../rehearsalLines.js'
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
    const actOf = { warmup: 'warmup', word: 'warmup', read: 'read', build: 'build', blind: 'blind', discern: 'discern', take: 'take', mirror: 'take' }
    for (const seed of ['a', 'd', 'g', 'x', 'y']) { // реплика акта — конкретный вариант (rh_done_b…), каким бы ни выбрало семя
      for (const a of buildActs({ ...fixturePlan('three'), seed }, { only: null }).acts) {
        const ids = [a.line, ...(a.final?.passes ?? []).map(p => p.line)].filter(Boolean)
        for (const id of ids) expect(ACT_LINES[actOf[a.id]], `${seed}: ${a.id} → ${id}`).toContain(id)
      }
    }
    expect(ACT_LINES.intro).toEqual(['rh_start', 'rh_start_b']); expect(ACT_LINES.summary).toEqual(['rh_done', 'rh_done_b']); expect(ACT_LINES.blind).toEqual(['rh_blind', 'rh_blind_hint', 'rh_blind_hint_pre']); expect(ACT_LINES.warmup).toEqual(['rh_warmup', 'rh_warmup_miss'])
  })
  it('ключи вариантов (b, c) стоят в ACT_LINES рядом с основным ключом и попадают в «Озвучить реплики»; без вариантов (rh_blind_hint, rh_discern) — один ключ', () => {
    for (const [act, ids] of Object.entries(ACT_LINES)) for (const id of ids) expect(ACT_LINES[act], id).toEqual(expect.arrayContaining(lineVariants(baseLineId(id))))
    expect(ACT_LINES.build).toEqual(['rh_build', 'rh_build_b', 'rh_build_c', 'rh_clear', 'rh_clear_b', 'rh_clear_c', 'rh_normal'])
    expect(ACT_LINES.take).toEqual(['rh_take', 'rh_mirror'])
    expect(lineVariants('rh_blind_hint')).toEqual(['rh_blind_hint']); expect(lineVariants('rh_discern')).toEqual(['rh_discern'])
    expect(missingPitLines(null).map(m => m.id)).toEqual(expect.arrayContaining(['rh_done_b', 'rh_start_b', 'rh_clear_c', 'rh_blind_hint_pre']))
    expect(missingPitLines(null)).toHaveLength(REHEARSAL_LINES.length - 1) // все, кроме шаблона со {word}
  })
  it('состояния: озвучена (url), нет озвучки, со {word} — не озвучивается (с причиной)', () => {
    const rows = allLineRows(voiced(['rh_start', 'rh_build']))
    const by = Object.fromEntries(rows.map(r => [r.id, r]))
    expect(by.rh_start).toMatchObject({ state: 'ok', url: 'u/rh_start.mp3', why: '' })
    expect(by.rh_read_why).toMatchObject({ state: 'missing', url: null, why: MISSING_WHY })
    expect(by.rh_blind_hint).toMatchObject({ state: 'template', template: true, why: TEMPLATE_WHY })
    expect(TEMPLATE_WHY).toContain('{word} не озвучивается'); expect(rows).toHaveLength(REHEARSAL_LINES.length)
  })
  it('счётчик этапа: «озвучено 2/7»; реплика со {word} в счёт не входит и считается отдельно', () => {
    const lines = voiced(['rh_build', 'rh_clear', 'rh_blind'])
    expect(actVoiceCount('build', lines)).toEqual({ done: 2, total: 7, templates: 0 }) // rh_build и rh_clear — по три ключа, rh_normal — один
    expect(actVoiceCount('blind', lines)).toEqual({ done: 1, total: 2, templates: 1 }) // rh_blind и «Начни с» озвучиваются, «Начни с {word}» — шаблон
    expect(actVoiceCount('intro', lines)).toEqual({ done: 0, total: 2, templates: 0 })
    expect(actLineRows('take', lines).map(r => r.id)).toEqual(['rh_take', 'rh_mirror'])
    expect(actVoiceCount('build', null)).toEqual({ done: 0, total: 7, templates: 0 })
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

describe('«Полная игра» (карточка 1)', () => {
  it('первая в POLISH_CARDS; доступна всегда, пока есть план; план — вся репетиция (без only), как у null', () => {
    expect(POLISH_CARDS[0]).toMatchObject({ id: FULL_ID, title: 'Полная игра' }); expect(POLISH_CARDS.slice(1).map(a => a.id)).toEqual(ONLY_IDS)
    const plan = fixturePlan('one')
    expect(actAvailable(plan, FULL_ID)).toBe(true); expect(actAvailable(null, FULL_ID)).toBe(false)
    expect(planForAct(plan, FULL_ID).only).toBeUndefined(); expect(planForAct(plan, null).only).toBeUndefined(); expect(planForAct(plan, 'build').only).toBe('build')
  })
  it('реплики полной игры — все реплики репетиции; счётчик озвученных общий', () => {
    expect(actLineRows(FULL_ID, null)).toHaveLength(REHEARSAL_LINES.length)
    const c = actVoiceCount(FULL_ID, voiced(['rh_start', 'rh_done']))
    expect(c.done).toBe(2); expect(c.total + c.templates).toBe(REHEARSAL_LINES.length)
  })
})
