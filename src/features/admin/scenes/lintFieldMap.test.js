import { describe, it, expect } from 'vitest'
import { lintPath, fieldId, fieldIdCandidates, fieldSection, findField } from './lintFieldMap.js'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { newDraft, setSlot } from './builderModel.js'

describe('замечание линтера → поле формы', () => {
  it('путь из текста и id поля', () => {
    expect(lintPath('timeline[3].text — длинно (120 символов)')).toBe('timeline[3].text')
    expect(lintPath('slots.desk-left — предмет висит')).toBe('slots.desk-left')
    expect(lintPath('characters.a.palette.fur — цвет')).toBe('characters.a.palette.fur')
    expect(lintPath('Бюджет узлов SVG: 300 > 250')).toBe('slots')
    expect(lintPath('Сцена должна быть объектом')).toBeNull()
    expect(fieldId('timeline[3].text')).toBe('f-timeline-3-text')
    expect(fieldId('slots.desk-left')).toBe('f-slots-desk-left')
    expect(fieldId(null)).toBeNull()
  })

  it('кандидаты от точного к общему; раздел', () => {
    expect(fieldIdCandidates('characters.a.palette.fur — x')).toEqual(['f-characters-a-palette-fur', 'f-characters-a-palette', 'f-characters-a', 'f-characters'])
    expect(fieldIdCandidates('timeline — минимум 2 реплики')).toEqual(['f-timeline'])
    expect(fieldIdCandidates('что-то без пути')).toEqual([])
    expect(fieldSection('timeline[1].who — a|b')).toBe('timeline')
    expect(fieldSection('slots — пустые')).toBe('slots')
    expect(fieldSection('characters — одно имя')).toBe('characters')
    expect(fieldSection('location — office | cafe')).toBe('scene')
  })

  it('пути озвучки перевода и режимов ведут к id полей сборщика', () => {
    expect(fieldIdCandidates('timeline[2].translationAudioUrl — озвучка перевода устарела')[0]).toBe('f-timeline-2-translationAudioUrl')
    expect(fieldIdCandidates('options.voice.translation — включена озвучка перевода')).toEqual(['f-options-voice-translation', 'f-options-voice', 'f-options'])
    expect(fieldIdCandidates('options.display — режим «текст + перевод»')[0]).toBe('f-options-display')
    expect(fieldIdCandidates('options.translationVoiceId — непустая строка')[0]).toBe('f-options-translationVoiceId')
    expect(fieldIdCandidates('characters.b.voice.translationVoiceId — строка')[0]).toBe('f-characters-b-voice-translationVoiceId')
    expect(fieldIdCandidates('timeline[1].translation — не длиннее 140 символов')[0]).toBe('f-timeline-1-translation')
    expect(fieldIdCandidates('timeline — сцена близка к лимиту 64 КБ (59 КБ, 92%)')).toEqual(['f-timeline'])
    expect(fieldSection('options.display — x')).toBe('scene')
  })

  it('findField берёт первый существующий кандидат', () => {
    const doc = { getElementById: id => (id === 'f-characters-a' ? { id } : null) }
    expect(findField('characters.a.palette.fur — x', doc)).toEqual({ id: 'f-characters-a' })
    expect(findField('nothing', doc)).toBeNull()
  })

  it('все реальные замечания линтера на сломанной сцене ведут к какому-то полю', () => {
    const broken = setSlot(newDraft(), 'table', null)
    broken.slots['desk-left'] = 'laptop' // предмет без стола (минуя setSlot)
    broken.timeline = [{ who: 'a', text: 'x'.repeat(120), emotion: 'neutral' }, { who: 'a', text: 'без знака', emotion: 'neutral' }, { who: 'a', text: 'Три.', emotion: 'neutral' }]
    const out = lintScene(broken)
    expect(out.length).toBeGreaterThan(3)
    for (const x of out) expect(fieldIdCandidates(x.text).length, x.text).toBeGreaterThan(0)
  })
})
