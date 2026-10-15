import { describe, it, expect } from 'vitest'
import { panelKeysFor, panelLintState, panelTone } from './lintPanelMap.js'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { newDraft, setSlot } from './builderModel.js'

// Замечание линтера → цепочка панелей (внешняя → вложенная); сводка тона панелей
describe('lintPanelMap', () => {
  it('цепочки вложенности по пути ошибки', () => {
    expect(panelKeysFor('timeline[3].text — длинно')).toEqual(['timeline', 'timeline.3'])
    expect(panelKeysFor('timeline — минимум 2 реплики')).toEqual(['timeline'])
    expect(panelKeysFor('characters.a.palette.fur — цвет')).toEqual(['characters', 'characters.a'])
    expect(panelKeysFor('characters.b.voice.voiceId — x')).toEqual(['characters', 'characters.b', 'characters.b.voice'])
    expect(panelKeysFor('characters — одно имя')).toEqual(['characters'])
    expect(panelKeysFor('slots.desk-left — висит')).toEqual(['slots', 'slots.local'])
    expect(panelKeysFor('slots.table — пусто')).toEqual(['slots', 'slots.common'])
    expect(panelKeysFor('slots — все пустые')).toEqual(['slots'])
    expect(panelKeysFor('Бюджет узлов SVG: 300 > 250')).toEqual(['slots'])
    expect(panelKeysFor('task.accept — нет синонимов')).toEqual(['task'])
    expect(panelKeysFor('options.loop — x')).toEqual(['options'])
    expect(panelKeysFor('location — office | cafe')).toEqual(['location'])
    expect(panelKeysFor('title — пустое')).toEqual(['header'])
    expect(panelKeysFor('id — латиница')).toEqual(['header'])
    expect(panelKeysFor('Сцена должна быть объектом')).toEqual([])
  })

  it('озвучка перевода и режимы: панель реплики, «Параметры воспроизведения», «Голос» персонажа', () => {
    expect(panelKeysFor('timeline[2].translationAudioUrl — озвучка перевода устарела')).toEqual(['timeline', 'timeline.2'])
    expect(panelKeysFor('options.voice.translation — включена озвучка перевода')).toEqual(['options'])
    expect(panelKeysFor('options.display — режим both')).toEqual(['options'])
    expect(panelKeysFor('options.translationVoiceId — непустая строка')).toEqual(['options'])
    expect(panelKeysFor('characters.a.voice.translationVoiceId — строка')).toEqual(['characters', 'characters.a', 'characters.a.voice'])
    expect(panelKeysFor('timeline — сцена близка к лимиту 64 КБ')).toEqual(['timeline'])
  })

  it('сводка: ошибка красит и подпанель, и родителя; warn не красный', () => {
    const lint = [
      { level: 'error', text: 'timeline[2].text — пусто' },
      { level: 'warn', text: 'timeline[0].text — без знака' },
      { level: 'warn', text: 'characters — одно имя' },
    ]
    const st = panelLintState(lint)
    expect(st.timeline).toEqual({ errors: 1, warns: 1 })
    expect(st['timeline.2']).toEqual({ errors: 1, warns: 0 })
    expect(st['timeline.0']).toEqual({ errors: 0, warns: 1 })
    expect(st.characters).toEqual({ errors: 0, warns: 1 })
    expect(panelTone(st, 'timeline')).toBe('error') // свёрнутый родитель — красный заголовок
    expect(panelTone(st, 'timeline.2')).toBe('error')
    expect(panelTone(st, 'timeline.0')).toBe('warn')
    expect(panelTone(st, 'characters')).toBe('warn')
    expect(panelTone(st, 'slots')).toBeNull()
    expect(panelTone(null, 'slots')).toBeNull()
    expect(panelLintState(null)).toEqual({})
  })

  it('каждое реальное замечание на сломанной сцене ведёт хотя бы к одной панели', () => {
    const broken = setSlot(newDraft(), 'table', null)
    broken.slots['desk-left'] = 'laptop'
    broken.timeline = [{ who: 'a', text: 'x'.repeat(120), emotion: 'neutral' }, { who: 'a', text: 'без знака', emotion: 'neutral' }, { who: 'a', text: 'Три.', emotion: 'neutral' }]
    const out = lintScene(broken)
    expect(out.some(x => x.level === 'error')).toBe(true)
    for (const x of out) expect(panelKeysFor(x.text).length, x.text).toBeGreaterThan(0)
    const st = panelLintState(out)
    expect(panelTone(st, 'slots')).toBe('error')
    expect(panelTone(st, 'slots.local')).toBe('error')
  })
})
