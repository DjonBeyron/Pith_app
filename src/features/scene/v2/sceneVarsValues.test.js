import { describe, it, expect } from 'vitest'
import { buildSceneValues, sceneSeed } from './sceneVarsValues.js'
import { fillSceneVars } from './sceneVars.js'
import { demoTemplateScene } from './demoScenes.js'

const W = (text, level, due = false) => ({ key: text, text, translation: `${text}-ru`, level, due, step: level })
const WORDS = [W('cheese', 1), W('apple', 1), W('soup', 2, true), W('tea', 3), W('bread', 4)]
const scene = pick => ({ ...demoTemplateScene, vars: { food: { pick, fallback: { text: 'a sandwich', translation: 'бутерброд' } } } })

describe('buildSceneValues', () => {
  it('weak берёт слово уровня 1; один seed — то же слово, разные seed дают оба кандидата', () => {
    const a = buildSceneValues(scene('weak'), WORDS, 'x')
    expect(buildSceneValues(scene('weak'), WORDS, 'x').values).toEqual(a.values)
    expect(['cheese', 'apple']).toContain(a.values.food.text)
    const seen = new Set(Array.from({ length: 40 }, (_, i) => buildSceneValues(scene('weak'), WORDS, `s${i}`).values.food.text))
    expect(seen).toEqual(new Set(['cheese', 'apple']))
  })
  it('due — только просроченные; known — уровни 2–4', () => {
    expect(buildSceneValues(scene('due'), WORDS, 'a').values.food.text).toBe('soup')
    const lv = new Set(Array.from({ length: 40 }, (_, i) => buildSceneValues(scene('known'), WORDS, `k${i}`).report[0].level))
    expect([...lv].sort()).toEqual([2, 3, 4])
  })
  it('отчёт: слово → уровень → правило; due помечен', () => {
    const r = buildSceneValues(scene('due'), WORDS, 'a').report[0]
    expect(r).toMatchObject({ name: 'food', pick: 'due', source: 'memory', level: 2, due: true, candidates: 1, word: { text: 'soup', translation: 'soup-ru' } })
    expect(r.reason).toContain('просрочен повтор')
  })
  it('нет подходящего: запасное, значений нет, причина названа', () => {
    const r = buildSceneValues(scene('weak'), [W('tea', 3)], 'a')
    expect(r.values).toEqual({})
    expect(r.report[0]).toMatchObject({ source: 'fallback', level: null, word: { text: 'a sandwich', translation: 'бутерброд' } })
    expect(r.report[0].reason).toBe('у вас в памяти нет слов уровня 1 с переводом — показано запасное')
    expect(buildSceneValues(scene('due'), [W('tea', 3)], 'a').report[0].reason).toMatch(/нет просроченных/)
    expect(buildSceneValues(scene('known'), [W('cheese', 1)], 'a').report[0].reason).toMatch(/уровней 2–4/)
    expect(buildSceneValues(scene('weak'), [], 'a').report[0].source).toBe('fallback')
  })
  it('значения подставляются через fillSceneVars; сцена без vars и мусор не падают', () => {
    const { values } = buildSceneValues(scene('weak'), [W('cheese', 1)], 'a')
    expect(fillSceneVars(scene('weak'), values).timeline[0].text).toContain('cheese')
    expect(buildSceneValues({}, WORDS, 'a')).toEqual({ values: {}, report: [] })
    expect(buildSceneValues(null, null)).toEqual({ values: {}, report: [] })
  })
  it('sceneSeed: день + id сцены', () => { expect(sceneSeed('s1', '2026-10-16')).toBe('2026-10-16:s1') })
})
