import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { meaningMap, meaningRows, mergeMeanings, isDirty, meaningTexts, RACE_PHRASE_RU_KEY, RACE_PHRASE_SCENE_KEY } from './racePhraseMeaning.js'
import { transTexts, transKey } from '../../pitrace/raceTrans.js'

// «Смысл фразы» (этап 2): чистые функции и разметка блока (озвучка и настройки подменены)
vi.mock('./useTransVoice.js', () => ({ default: ({ plan, texts }) => {
  const rows = plan ? texts(plan).map(t => ({ text: t, key: transKey(t), has: t === 'скажи, что рад знакомству' })) : []
  return { rows, busy: false, step: '', errors: {}, done: rows.filter(r => r.has).length, total: rows.length, voice() {} }
} }))
vi.mock('../../../shared/api/appSettingsApi.js', () => ({ getAppSetting: async () => ({}), saveAppSetting: async (k, v) => v }))
import RacePhraseMeaning from './RacePhraseMeaning.jsx'

const plan = {
  phrase: 'Nice | to meet you',
  phrases: [
    { id: 'm1', text: 'Nice to meet you', key: 'nice to meet you', ru: 'скажи, что рад знакомству', audio: { url: 'u', duration: 1 } },
    { id: 'm2', text: 'Where are you from', key: 'where are you from', ru: '', audio: null },
  ],
}

describe('racePhraseMeaning', () => {
  it('ключ настройки и чистка значения', () => {
    expect(RACE_PHRASE_RU_KEY).toBe('race_phrase_ru')
    expect(meaningMap(null)).toEqual({})
    expect(meaningMap({ a: ' x ', b: 3, c: '' })).toEqual({ a: 'x' })
  })
  it('строки — фразы плана; сохранённый смысл главнее смысла плана; без целой озвучки — «по словам»', () => {
    const rows = meaningRows(plan, { 'where are you from': 'спроси, откуда человек' })
    expect(rows.map(r => [r.key, r.ru, r.byWords])).toEqual([['nice to meet you', 'скажи, что рад знакомству', false], ['where are you from', 'спроси, откуда человек', true]])
  })
  it('в плане фраз нет — фраза урока', () => {
    expect(meaningRows({ phrase: "I'm | trying | to learn" }, {})).toEqual([{ key: 'i am trying to learn', text: "I'm trying to learn", ru: '', scene: '', byWords: false }])
    expect(meaningRows(null)).toEqual([])
  })
  it('слияние правок: пустое убирает ключ, чужие ключи остаются; признак правок', () => {
    const saved = { a: 'старое', other: 'чужое' }
    expect(mergeMeanings(saved, { a: '', b: ' новое ' })).toEqual({ other: 'чужое', b: 'новое' })
    expect(isDirty(saved, { a: 'старое' })).toBe(false)
    expect(isDirty(saved, { a: 'новое' })).toBe(true)
  })
  it('смыслы попадают в набор озвучки переводов (transTexts) и в свой набор блока', () => {
    const texts = transTexts({ words: [{ text: 'meet', translation: 'встретить' }], chunks: [], extraWords: [{ text: 'where', translation: 'где' }], phrases: plan.phrases })
    expect(texts).toEqual(expect.arrayContaining(['встретить', 'где', 'скажи, что рад знакомству'])); expect(texts.at(-1)).toBe('скажи, что рад знакомству') // слова (с добором до 6 дежурными, v3.3.138) → смыслы фраз последними
    expect(meaningTexts(meaningRows(plan))).toEqual(['скажи, что рад знакомству'])
  })
  it('ситуация (круг 1): свой ключ настройки, сохранённая главнее плана, попадает в набор озвучки блока', () => {
    expect(RACE_PHRASE_SCENE_KEY).toBe('race_phrase_scene')
    const p = { phrases: [{ ...plan.phrases[0], scene: 'ты знакомишься с новым человеком' }, plan.phrases[1]] }
    const rows = meaningRows(p, {}, { 'where are you from': 'ты в аэропорту' })
    expect(rows.map(r => r.scene)).toEqual(['ты знакомишься с новым человеком', 'ты в аэропорту'])
    expect(meaningTexts(rows)).toEqual(['скажи, что рад знакомству', 'ты знакомишься с новым человеком', 'ты в аэропорту'])
    expect(mergeMeanings({ 'nice to meet you': 'старая' }, { 'nice to meet you': '' })).toEqual({})
  })
  it('разметка: поля, «озвучено», «читается по словам», кнопки', () => {
    const html = renderToStaticMarkup(createElement(RacePhraseMeaning, { plan }))
    expect(html).toContain('Nice to meet you'); expect(html).toContain('Where are you from')
    expect(html).toContain('озвучено'); expect(html).toContain('читается по словам')
    expect(html).toContain('Смысл по-русски (намерение, не перевод)'); expect(html).toContain('скажи, что рад знакомству')
    expect(html).toContain('Сохранить'); expect(html).toContain('Смыслы озвучены')
    expect(html).toContain('Смысл (круг 2)'); expect(html).toContain('Ситуация (круг 1)'); expect(html).toContain('placeholder="ты знакомишься с новым человеком"')
    expect(html).toContain('data-testid="race-scene-nice to meet you"')
    expect(renderToStaticMarkup(createElement(RacePhraseMeaning, { plan: { words: [] } }))).toContain('В плане нет фраз')
  })
})
