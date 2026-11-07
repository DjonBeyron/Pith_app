import { describe, it, expect } from 'vitest'
import { defaultPhraseScene, PHRASE_SCENE_DEFAULTS } from './racePhraseSceneDefaults.js'
import { phraseScene, phraseOfModule, phraseOfPlan } from './racePhraseOf.js'
import { buildPhrases } from './racePhrasePool.js'
import { normalizePhrase } from './racePhraseNorm.js'
import { BASE, deps } from './racePlanTestData.js'
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'

// Ситуация фразы (круг 1 «Пойми»): race_phrase_scene[key] → черновик кода → '' (не перевод)
describe('ситуация фразы (scene)', () => {
  it('черновики: ключ — normText, ищутся по тексту и по ключу; без заглавной и точки', () => {
    expect(defaultPhraseScene('Nice to meet you')).toBe('ты знакомишься с новым человеком')
    expect(defaultPhraseScene(normText("I'm gonna go to sleep"))).toBe('поздно, ты устал и прощаешься на ночь')
    expect(defaultPhraseScene('Something unknown')).toBe('')
    expect(PHRASE_SCENE_DEFAULTS.size).toBe(6)
    for (const s of PHRASE_SCENE_DEFAULTS.values()) { expect(s).toMatch(/^[а-яё]/); expect(s).not.toMatch(/[.!]$/) }
  })
  it('порядок: правка админа → черновик → пусто (перевод названия не берётся)', () => {
    const key = normText('Nice to meet you')
    expect(phraseScene({ [key]: 'ты на вечеринке' }, key)).toBe('ты на вечеринке')
    expect(phraseScene({}, key)).toBe('ты знакомишься с новым человеком')
    expect(phraseScene(undefined, normText('How old are you'))).toBe('')
  })
  it('фраза модуля и фраза плана несут scene из sceneMap, из черновика или пустую', () => {
    const mod = { id: 'm1', title: 'Nice to meet you', title_translation: 'Приятно познакомиться', lesson_ids: [] }
    expect(phraseOfModule(mod, { sceneMap: { 'nice to meet you': 'ты в гостях' } }).scene).toBe('ты в гостях')
    expect(phraseOfModule(mod, {}).scene).toBe('ты знакомишься с новым человеком')
    expect(phraseOfModule({ id: 'm3', title: 'How old are you', title_translation: 'Сколько тебе лет' }, {}).scene).toBe('')
    expect(phraseOfPlan({ phrase: "I'm | trying | to learn" }, {}).scene).toBe('тебя спросили, зачем тебе английский')
  })
  it('план из памяти: sceneMap из deps доходит до фраз; нормализация переносит scene', () => {
    const p = buildPhrases({ base: BASE, deps: deps({ sceneMap: { 'nice to meet you': 'ты на работе' } }) })
    expect(p[0]).toMatchObject({ id: 'm1', scene: 'ты на работе' })
    expect(p.find(x => x.id === 'm3').scene).toBe('') // How old are you — черновика нет
    expect(buildPhrases({ base: BASE, deps: deps() })[0].scene).toBe('ты знакомишься с новым человеком')
    expect(normalizePhrase({ text: 'Hi', scene: ' ты здороваешься ' }).scene).toBe('ты здороваешься')
    expect(normalizePhrase({ text: 'Hi' }).scene).toBe('')
  })
})
