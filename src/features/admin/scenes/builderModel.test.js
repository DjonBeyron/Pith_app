import { describe, it, expect } from 'vitest'
import {
  newDraft, clearScene, fromScene, setTitle, setId, setLocation, setSlot, clearSlots, fillDefaultSlots,
  updateCharacter, setPaletteColor, applyPalettePreset, matchPreset, setVoice, setOption, sameScene, exportJson,
} from './builderModel.js'
import { validateSceneV2, PALETTE_PRESETS } from '../../scene/v2/sceneSchemaV2.js'
import { lintErrors } from '../../scene/v2/sceneLint.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'

describe('черновик сборщика', () => {
  it('newDraft — валидная сцена без ошибок линтера, обе локации', () => {
    for (const loc of ['office', 'cafe']) {
      const d = newDraft(loc)
      expect(d.location).toBe(loc)
      expect(validateSceneV2(d)).toEqual([])
      expect(lintErrors(d)).toEqual([])
      expect(d.title).toBe('Новая сцена')
    }
  })

  it('операции не трогают исходник', () => {
    const d = newDraft()
    const json = JSON.stringify(d)
    setTitle(d, 'x'); setSlot(d, 'table', null); updateCharacter(d, 'a', { name: 'Z' }); setLocation(d, 'cafe')
    expect(JSON.stringify(d)).toBe(json)
  })

  it('setTitle режет по лимиту, setId — латиница/дефисы', () => {
    expect(setTitle(newDraft(), 'а'.repeat(120)).title).toHaveLength(80)
    expect(setId(newDraft(), 'Моя Сцена! 2').id).toBe('2')
    expect(setId(newDraft(), '--my scene--').id).toBe('my-scene')
    expect(setId(newDraft(), 'Demo_Scene-1').id).toBe('demo_scene-1')
    expect(setId(newDraft(), '').id).toBe('scene')
  })

  it('setLocation переносит общие слоты, свои очищает; с fillDefaults — заполняет', () => {
    const d = setSlot(newDraft(), 'window', null)
    const cafe = setLocation(d, 'cafe')
    expect(cafe.location).toBe('cafe')
    expect(cafe.slots.window).toBeNull()
    expect(cafe.slots.table).toBe('table')
    expect(cafe.slots['wall-art']).toBe('picture')
    expect(cafe.slots.counter).toBeNull()
    expect(cafe.slots['desk-left']).toBeUndefined()
    expect(validateSceneV2(cafe)).toEqual([])
    expect(setLocation(d, 'cafe', { fillDefaults: true }).slots.counter).toBe('coffee-machine')
    expect(setLocation(d, 'office')).toBe(d) // та же локация — тот же объект
    expect(setLocation(d, 'moon')).toBe(d)
  })

  it('setSlot: убрали стол — настольные слоты очищаются', () => {
    const d = newDraft()
    expect(d.slots['desk-left']).toBe('laptop')
    const noTable = setSlot(d, 'table', null)
    expect(noTable.slots.table).toBeNull()
    expect(noTable.slots['desk-left']).toBeNull()
    expect(noTable.slots['desk-center']).toBeNull()
    expect(noTable.slots.window).toBe('window') // остальное не тронуто
    expect(setSlot(d, 'nope', 'mug')).toBe(d)
    expect(setSlot(d, 'desk-left', 'mug').slots['desk-left']).toBe('mug')
  })

  it('clearSlots / fillDefaultSlots / clearScene', () => {
    const d = newDraft()
    expect(Object.values(clearSlots(d).slots).every(v => v === null)).toBe(true)
    expect(fillDefaultSlots(clearSlots(d)).slots.table).toBe('table')
    const c = clearScene(d)
    expect(c.timeline).toHaveLength(2)
    expect(validateSceneV2(c)).toEqual([])
  })

  it('персонажи: палитра, пресеты, голос', () => {
    let d = newDraft()
    d = updateCharacter(d, 'a', { name: 'Барсик', gender: 'female' })
    expect(d.characters.a.name).toBe('Барсик')
    expect(updateCharacter(d, 'c', { name: 'x' })).toBe(d)
    d = setPaletteColor(d, 'a', 'fur', '#123456')
    expect(d.characters.a.palette.fur).toBe('#123456')
    expect(matchPreset(d.characters.a.palette)).toBeNull()
    d = applyPalettePreset(d, 'a', 'black')
    expect(d.characters.a.palette).toEqual(PALETTE_PRESETS.black)
    expect(matchPreset(d.characters.a.palette)).toBe('black')
    expect(applyPalettePreset(d, 'a', 'rainbow')).toBe(d)
    d = setVoice(d, 'b', { pitch: 1.5, voiceId: '  ' })
    expect(d.characters.b.voice.pitch).toBe(1.5)
    expect(d.characters.b.voice.voiceId).toBeUndefined()
    d = setVoice(d, 'b', { voiceId: 'el-1' })
    expect(d.characters.b.voice.voiceId).toBe('el-1')
    expect(validateSceneV2(d)).toEqual([])
  })

  it('setOption приводит к boolean; sameScene / exportJson / fromScene', () => {
    const d = setOption(newDraft(), 'loop', 1)
    expect(d.options.loop).toBe(true)
    expect(sameScene(d, { ...d })).toBe(true)
    expect(sameScene(d, newDraft())).toBe(false)
    const back = JSON.parse(exportJson(d))
    expect(back).toEqual(d)
    expect(fromScene(demoCafeScene).location).toBe('cafe')
  })
})
