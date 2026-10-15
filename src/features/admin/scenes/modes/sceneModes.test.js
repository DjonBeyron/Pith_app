import { describe, it, expect } from 'vitest'
import {
  sceneModes, effectiveModes, overriddenFlags, setOverride, hasOverride, overrideProps, applyOverrideToScene,
  setDisplay, setVoiceFlag, setTranslationVoiceId, modesSummary, EMPTY_OVERRIDE,
} from './sceneModes.js'
import { normalizeSceneV2 } from '../../../scene/v2/sceneSchemaV2.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import { setVoice } from '../builderModel.js'
import { updateLine } from '../timelineOps.js'

// Предпросмотровые переопределения vs запись в сцену — чистая логика
const scene = normalizeSceneV2(demoOfficeScene) // options: bubbles true, без display/voice
const oldScene = { ...demoOfficeScene, options: { bubbles: false, autoplay: false, loop: false } }

describe('sceneModes — переопределения предпросмотра', () => {
  it('без переопределения предпросмотр = сцена (старый bubbles читается как раньше)', () => {
    expect(sceneModes(scene)).toEqual({ display: 'text', voice: { original: true, translation: false } })
    expect(sceneModes(oldScene).display).toBe('none')
    expect(effectiveModes(scene, EMPTY_OVERRIDE)).toEqual(sceneModes(scene))
    expect(overriddenFlags(scene).any).toBe(false)
    expect(hasOverride(EMPTY_OVERRIDE)).toBe(false)
    expect(overrideProps(EMPTY_OVERRIDE)).toEqual({ display: undefined, voice: null })
  })
  it('setOverride: отличное от сцены значение — переопределение; совпавшее — снимается', () => {
    let o = setOverride(EMPTY_OVERRIDE, scene, 'display', 'both')
    expect(o.display).toBe('both')
    expect(effectiveModes(scene, o).display).toBe('both')
    expect(overriddenFlags(scene, o)).toEqual({ display: true, original: false, translation: false, any: true })
    expect(overrideProps(o)).toEqual({ display: 'both', voice: null })
    o = setOverride(o, scene, 'display', 'text') // как в сцене → снято
    expect(o.display).toBeNull()
    o = setOverride(o, scene, 'translation', true)
    expect(o.voice).toEqual({ translation: true })
    expect(overrideProps(o).voice).toEqual({ translation: true })
    o = setOverride(o, scene, 'original', false)
    expect(effectiveModes(scene, o).voice).toEqual({ original: false, translation: true })
    o = setOverride(o, scene, 'translation', false)
    expect(o.voice).toEqual({ original: false })
    expect(setOverride(o, scene, 'bogus', 1)).toBe(o)
  })
  it('«Сделать по умолчанию»: в options пишутся только отличающиеся поля; сцена без переопределения не меняется', () => {
    const o = { display: 'both', voice: { translation: true } }
    const s = applyOverrideToScene(scene, o)
    expect(s.options).toEqual({ bubbles: true, autoplay: false, loop: false, display: 'both', voice: { original: true, translation: true } })
    expect(overriddenFlags(s, o).any).toBe(false) // после записи предпросмотр совпадает со сценой
    expect(applyOverrideToScene(scene, EMPTY_OVERRIDE)).toBe(scene)
    expect(scene.options.display).toBeUndefined() // исходник не тронут
  })
})

describe('sceneModes — запись в сцену и нормализация', () => {
  it('setDisplay пишет display и согласованный bubbles; нормализация потом не меняет ни байта', () => {
    const s = setDisplay(scene, 'none')
    expect(s.options).toMatchObject({ display: 'none', bubbles: false })
    expect(normalizeSceneV2(s)).toEqual(s)
    expect(setDisplay(scene, 'weird')).toBe(scene)
    // Старая сцена без display остаётся без display, пока админ не тронул контрол
    expect(normalizeSceneV2(oldScene).options).toEqual({ bubbles: false, autoplay: false, loop: false })
  })
  it('setVoiceFlag пишет полный объект voice; setTranslationVoiceId — trim, пусто удаляет', () => {
    const s = setVoiceFlag(scene, 'translation', true)
    expect(s.options.voice).toEqual({ original: true, translation: true })
    expect(setVoiceFlag(s, 'original', false).options.voice).toEqual({ original: false, translation: true })
    expect(setVoiceFlag(scene, 'narrator', true)).toBe(scene)
    const t = setTranslationVoiceId(scene, '  yoZ06aMxZJJ28mfd3POQ ')
    expect(t.options.translationVoiceId).toBe('yoZ06aMxZJJ28mfd3POQ')
    expect(setTranslationVoiceId(t, '').options.translationVoiceId).toBeUndefined()
  })
  it('builderModel.setVoice: пустой translationVoiceId у персонажа удаляется (= как у сцены)', () => {
    const s = setVoice(scene, 'a', { translationVoiceId: 'abc' })
    expect(s.characters.a.voice.translationVoiceId).toBe('abc')
    expect(setVoice(s, 'a', { translationVoiceId: ' ' }).characters.a.voice.translationVoiceId).toBeUndefined()
  })
  it('timelineOps.updateLine режет перевод по 140 символам', () => {
    const tl = updateLine(scene.timeline, 0, { translation: 'я'.repeat(150) })
    expect(tl[0].translation.length).toBe(140)
    expect(updateLine(tl, 0, { translation: '' })[0].translation).toBeUndefined()
  })
  it('сводка словами', () => {
    expect(modesSummary(scene)).toBe('показ: текст · озвучка: оригинал')
    expect(modesSummary(scene, { display: 'both', voice: { translation: true } })).toBe('показ: текст + перевод · озвучка: оригинал + перевод')
    expect(modesSummary(setVoiceFlag(setDisplay(scene, 'none'), 'original', false))).toBe('показ: без текста · озвучка: выключена')
  })
})
