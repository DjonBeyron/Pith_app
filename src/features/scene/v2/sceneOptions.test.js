import { describe, it, expect } from 'vitest'
import {
  displayOfOptions, normalizeVoiceFlags, normalizeSceneOptions, validateSceneOptions, resolveDisplay, bubbleDisplay, resolveVoiceFlags,
} from './sceneOptions.js'
import { normalizeSceneV2, validateSceneV2 } from './sceneSchemaV2.js'
import { demoOfficeScene } from './demoScenes.js'

const clone = s => JSON.parse(JSON.stringify(s))

describe('sceneOptions — режим показа и флаги озвучки', () => {
  it('display из options; совместимость с bubbles: true ↔ text, false ↔ none; display главнее', () => {
    expect(displayOfOptions(undefined)).toBe('text')
    expect(displayOfOptions({})).toBe('text')
    expect(displayOfOptions({ bubbles: true })).toBe('text')
    expect(displayOfOptions({ bubbles: false })).toBe('none')
    expect(displayOfOptions({ display: 'both' })).toBe('both')
    expect(displayOfOptions({ display: 'both', bubbles: false })).toBe('both')
    expect(displayOfOptions({ display: 'none', bubbles: true })).toBe('none')
    expect(displayOfOptions({ display: 'huge' })).toBe('text')
  })

  it('нормализация: старые options не меняются; display/voice/translationVoiceId — только если заданы; bubbles согласуется с display', () => {
    expect(normalizeSceneOptions({ bubbles: true, autoplay: false, loop: false })).toEqual({ bubbles: true, autoplay: false, loop: false })
    expect(normalizeSceneOptions(undefined)).toEqual({ bubbles: true, autoplay: false, loop: false })
    expect(normalizeSceneOptions({ bubbles: false })).toEqual({ bubbles: false, autoplay: false, loop: false })
    expect(normalizeSceneOptions({ display: 'none', bubbles: true })).toEqual({ bubbles: false, autoplay: false, loop: false, display: 'none' })
    expect(normalizeSceneOptions({ display: 'both', loop: true, voice: { translation: true }, translationVoiceId: ' v9 ' }))
      .toEqual({ bubbles: true, autoplay: false, loop: true, display: 'both', voice: { original: true, translation: true }, translationVoiceId: 'v9' })
    expect(normalizeSceneOptions({ voice: {} }).voice).toEqual({ original: true, translation: false })
    expect(normalizeSceneOptions({ voice: 'yes' }).voice).toBeUndefined()
    // Нормализованная сцена без новых полей — байт в байт как раньше
    const n = normalizeSceneV2(demoOfficeScene)
    expect(n.options).toEqual(demoOfficeScene.options)
    expect(normalizeSceneV2(n)).toEqual(n)
  })

  it('normalizeVoiceFlags: неполный объект дополняется базой', () => {
    expect(normalizeVoiceFlags(null)).toEqual({ original: true, translation: false })
    expect(normalizeVoiceFlags({ original: false })).toEqual({ original: false, translation: false })
    expect(normalizeVoiceFlags({ translation: true }, { original: false, translation: false })).toEqual({ original: false, translation: true })
    expect(normalizeVoiceFlags({ original: 'no' })).toEqual({ original: true, translation: false })
  })

  it('валидация options: enum display, voice из true/false без лишних полей, translationVoiceId строка, прочее — boolean', () => {
    const errs = o => { const e = []; validateSceneOptions(o, e); return e }
    expect(errs({ bubbles: true, display: 'both', voice: { original: true, translation: false }, translationVoiceId: 'v1' })).toEqual([])
    expect(errs({ display: 'all' })).toEqual(['options.display — none | text | both'])
    expect(errs({ voice: { original: 'yes' } })).toEqual(['options.voice.original — true/false'])
    expect(errs({ voice: { narrator: true } })[0]).toMatch(/options\.voice\.narrator — лишнее/)
    expect(errs({ voice: true })[0]).toMatch(/options\.voice — объект/)
    expect(errs({ translationVoiceId: '' })[0]).toMatch(/translationVoiceId/)
    expect(errs({ loop: 'yes' })).toEqual(['options.loop — true/false'])
    expect(errs('x')[0]).toMatch(/^options — объект/)
    // через validateSceneV2 — с путями
    const s = clone(demoOfficeScene)
    s.options.display = 'both'
    s.options.voice = { translation: true }
    expect(validateSceneV2(s)).toEqual([])
    s.options.voice.translation = 1
    expect(validateSceneV2(s)).toEqual(['options.voice.translation — true/false'])
  })

  it('resolveDisplay: проп display главнее showBubbles; showBubbles false → none, true → режим сцены, но не none', () => {
    const s = { options: { display: 'both' } }
    expect(resolveDisplay(s)).toBe('both')
    expect(resolveDisplay(s, { display: 'none' })).toBe('none')
    expect(resolveDisplay(s, { showBubbles: false })).toBe('none')
    expect(resolveDisplay(s, { showBubbles: true })).toBe('both')
    expect(resolveDisplay({ options: { display: 'none' } }, { showBubbles: true })).toBe('text')
    expect(resolveDisplay({ options: { bubbles: false } })).toBe('none')
    expect(resolveDisplay(null)).toBe('text')
    expect(resolveDisplay(s, { display: 'weird', showBubbles: false })).toBe('none')
  })

  it('bubbleDisplay: задание «О чём диалог» перекрывает both → text; none остаётся none', () => {
    const task = { kind: 'translate', lineIndex: null, accept: [] }
    expect(bubbleDisplay({ options: { display: 'both' }, task })).toBe('text')
    expect(bubbleDisplay({ options: { display: 'both' } })).toBe('both')
    expect(bubbleDisplay({ options: { display: 'both' }, task }, { display: 'both' })).toBe('text')
    expect(bubbleDisplay({ options: { display: 'both' }, task }, { display: 'none' })).toBe('none')
  })

  it('resolveVoiceFlags: options сцены ⊕ неполное переопределение', () => {
    expect(resolveVoiceFlags({})).toEqual({ original: true, translation: false })
    expect(resolveVoiceFlags({ options: { voice: { translation: true } } })).toEqual({ original: true, translation: true })
    expect(resolveVoiceFlags({ options: { voice: { translation: true } } }, { original: false })).toEqual({ original: false, translation: true })
    expect(resolveVoiceFlags({ options: { voice: { translation: true } } }, { translation: false })).toEqual({ original: true, translation: false })
    expect(resolveVoiceFlags(null, null)).toEqual({ original: true, translation: false })
  })
})
