import { describe, it, expect } from 'vitest'
import { tokenizeTemplate, fillTemplate, fillSceneVars, sceneVarNames, usesVars, previewValues, normalizeVars } from './sceneVars.js'
import { validateSceneV2 } from './sceneValidate.js'
import { normalizeSceneV2, parseSceneV2 } from './sceneSchemaV2.js'
import { lintScene } from './sceneLint.js'
import { resolveSceneNode } from './sceneNode.js'
import { demoTemplateScene, demoCafeScene, DEMO_SCENES } from './demoScenes.js'
import { templateNote } from './sceneVarsNote.js'
import { sceneLegendText, sceneLegend } from './sceneLegend.js'
import { buildPrompt } from '../../admin/scenes/aiPrompt.js'

const clone = o => JSON.parse(JSON.stringify(o))
const withTl = (timeline, extra = {}) => ({ ...clone(demoTemplateScene), timeline, ...extra })
const line = (text, extra = {}) => ({ who: 'a', text, emotion: 'happy', ...extra })
const lintTexts = (scene, level) => lintScene(scene).filter(x => !level || x.level === level).map(x => x.text)

describe('разбор и подстановка строки', () => {
  it('токены: плейсхолдеры, {name:ru}, экранирование и одиночные скобки', () => {
    const t = tokenizeTemplate('a {food} {food:ru} {{x}} {')
    expect(t.filter(x => x.name).map(x => [x.name, x.ru])).toEqual([['food', false], ['food', true]])
    expect(t.filter(x => x.esc)).toHaveLength(2)
    expect(t.some(x => x.stray === '{')).toBe(true)
  })
  it('fillTemplate: {{ }} → скобки, неизвестное остаётся', () => {
    const pick = n => (n === 'a' ? 'cheese' : null)
    expect(fillTemplate('{a} {{b}} {zzz}', pick)).toBe('cheese {b} {zzz}')
  })
})

describe('fillSceneVars', () => {
  it('сцена без vars — та же ссылка', () => {
    expect(fillSceneVars(demoCafeScene)).toBe(demoCafeScene)
    expect(usesVars(demoCafeScene)).toBe(false)
    expect(sceneVarNames(demoCafeScene)).toEqual([])
  })
  it('запасные слова: текст и перевод {food:ru}, vars убирается, исходник не меняется', () => {
    const src = clone(demoTemplateScene)
    const out = fillSceneVars(src)
    expect(out.timeline[0].text).toBe('Can I have a sandwich, please?')
    expect(out.timeline[0].translation).toBe('Можно мне бутерброд, пожалуйста?')
    expect(out.vars).toBeUndefined()
    expect(src).toEqual(demoTemplateScene)
    expect(previewValues(src)).toEqual({ food: { text: 'a sandwich', translation: 'бутерброд' } })
  })
  it('значения подменяют запасные; пустое значение — запасное', () => {
    expect(fillSceneVars(demoTemplateScene, { food: { text: 'cheese', translation: 'сыр' } }).timeline[1].translation).toBe('Спасибо! сыр выглядит отлично.')
    expect(fillSceneVars(demoTemplateScene, { food: { text: '  ' } }).timeline[0].text).toContain('a sandwich')
    expect(fillSceneVars(demoTemplateScene, { food: { text: 'cheese' } }).timeline[0].translation).toBe('Можно мне cheese, пожалуйста?')
  })
  it('{{ }}, неизвестная переменная и {name} в переводе', () => {
    const s = withTl([line('Use {{braces}} and {nope} and {food}', { translation: 'слово {food}' })])
    const out = fillSceneVars(s)
    expect(out.timeline[0].text).toBe('Use {braces} and {nope} and a sandwich')
    expect(out.timeline[0].translation).toBe('слово a sandwich')
  })
  it('озвучка целой реплики сбрасывается только у шаблонных; segments убирается', () => {
    const audio = { audioUrl: 'https://x/a.mp3', wordTimings: [{ start: 0, end: 1 }], audioMeta: { hash: 'h' }, translationAudioUrl: 'https://x/t.mp3' }
    const s = withTl([line('Plain line.', audio), line('Have {food}.', { ...audio, segments: [{ text: 'Have ' }, { var: 'food' }] }), line('Plain {food}.', { translation: 'Просто.', ...audio })])
    const out = fillSceneVars(s).timeline
    expect(out[0].audioUrl).toBe('https://x/a.mp3')
    expect(out[1].audioUrl).toBeUndefined()
    expect(out[1].wordTimings).toBeUndefined()
    expect(out[1].segments).toBeUndefined()
    expect(out[2].audioMeta).toBeUndefined()
    expect(out[2].translationAudioUrl).toBe('https://x/t.mp3') // перевод без плейсхолдера не менялся
  })
})

describe('валидатор и нормализация', () => {
  it('демо-шаблон валиден и не теряет vars при нормализации и parseSceneV2', () => {
    expect(validateSceneV2(demoTemplateScene)).toEqual([])
    expect(normalizeSceneV2(demoTemplateScene).vars).toEqual(demoTemplateScene.vars)
    const r = parseSceneV2(JSON.stringify(demoTemplateScene))
    expect(r.errors).toEqual([])
    expect(r.scene.vars.food.fallback.text).toBe('a sandwich')
  })
  it('сцена без vars остаётся без поля', () => {
    expect('vars' in normalizeSceneV2(demoCafeScene)).toBe(false)
    expect(normalizeVars({})).toBeUndefined()
  })
  it('ошибки: > 3 переменных, имя, нет fallback, pick, длина слова, форма', () => {
    const f = { pick: 'weak', fallback: { text: 'a' } }
    const bad = vars => validateSceneV2({ ...demoTemplateScene, vars }).join('|')
    expect(bad({ a: f, b: f, c: f, d: f })).toMatch(/не больше 3/)
    expect(bad({ 'bad name': f })).toMatch(/ключ слова/)
    expect(bad({ x234567890123456789: f })).toMatch(/ключ слова/)
    expect(bad({ a: { pick: 'weak' } })).toMatch(/vars\.a\.fallback — обязательное/)
    expect(bad({ a: { pick: 'zzz', fallback: { text: 'a' } } })).toMatch(/vars\.a\.pick/)
    expect(bad({ a: { pick: 'due', fallback: { text: 'x'.repeat(41) } } })).toMatch(/fallback\.text — не длиннее 40/)
    expect(bad({ a: { pick: 'due', fallback: { text: '' } } })).toMatch(/непустая/)
    expect(bad('str')).toMatch(/vars — объект/)
  })
  it('segments: структура и ссылки var; реплика с segments без audioUrl не ругается', () => {
    const ok = withTl([line('Have {food}.', { segments: [{ text: 'Have ' }, { var: 'food' }, { text: '.', audioUrl: 'https://x/a.mp3' }] }), line('Ok.')])
    expect(validateSceneV2(ok)).toEqual([])
    expect(lintTexts(ok, 'warn').join('|')).not.toMatch(/озвучено|audioUrl/)
    expect(normalizeSceneV2(ok).timeline[0].segments).toHaveLength(3)
    expect(validateSceneV2(withTl([line('x.', { segments: [{ var: 'nope' }] })])).join()).toMatch(/segments\[0\]\.var — слово пользователя 'nope'/)
    expect(validateSceneV2(withTl([line('x.', { segments: [] })])).join()).toMatch(/непустой массив/)
    expect(validateSceneV2(withTl([line('x.', { segments: [5] })])).join()).toMatch(/объект/)
  })
})

describe('линтер слов пользователя', () => {
  it('чисто для демо-шаблона', () => {
    expect(lintScene(demoTemplateScene)).toEqual([])
    for (const s of DEMO_SCENES) expect(lintScene(s).filter(x => x.level === 'error'), s.id).toEqual([])
  })
  it('плейсхолдер без переменной (и в сцене без vars)', () => {
    expect(lintTexts(withTl([line('Take {zzz}.')]), 'error').join()).toMatch(/слова пользователя 'zzz' нет в vars/)
    const plain = { ...clone(demoCafeScene) }
    plain.timeline[0].text = 'Hello {food}!'
    expect(lintTexts(plain, 'error').join()).toMatch(/слова пользователя 'food' нет в vars/)
  })
  it('вид плейсхолдера: {name} в переводе и {name:ru} в тексте — ошибки', () => {
    expect(lintTexts(withTl([line('Have {food}.', { translation: 'Дай {food}.' })]), 'error').join()).toMatch(/translation — слово-перевод пишется \{food:ru\}/)
    expect(lintTexts(withTl([line('Have {food:ru}.')]), 'error').join()).toMatch(/допустим только в translation/)
  })
  it('одиночная скобка — ошибка, {{ }} — нет; без vars скобки не трогаем', () => {
    expect(lintTexts(withTl([line('Have {food}.'), line('Oops { here.')]), 'error').join()).toMatch(/одиночная фигурная скобка/)
    expect(lintTexts(withTl([line('Have {food} {{ok}}.'), line('Ok.')]), 'error')).toEqual([])
    const plain = clone(demoCafeScene)
    plain.timeline[0].text = 'Set {a, b} please.'
    expect(lintTexts(plain, 'error')).toEqual([])
  })
  it('худший случай длины: шаблон + 40 на слово ≤ 140', () => {
    const fits = withTl([line(`${'x'.repeat(95)}{food}.`), line('Ok.')]) // 95 + 40 + 1 = 136
    const over = withTl([line(`${'x'.repeat(100)}{food}.`), line('Ok.')]) // 141
    expect(lintTexts(fits, 'error')).toEqual([])
    expect(lintTexts(over, 'error').join()).toMatch(/худший случай 141/)
  })
  it('переменная без fallback — ошибка линтера (из валидатора)', () => {
    const s = withTl([line('Have {food}.')], { vars: { food: { pick: 'weak' } } })
    expect(lintTexts(s, 'error').join()).toMatch(/fallback/)
  })
  it('в задании плейсхолдеры нельзя', () => {
    const s = withTl([line('Have {food}.', { translation: 'Дай {food:ru}.' })], { task: { kind: 'translate', lineIndex: 0, accept: ['Дай {food:ru}'] } })
    expect(lintTexts(s, 'error').join()).toMatch(/task\.accept\[0\] — в задании нельзя/)
  })
  it('неиспользуемая переменная — предупреждение', () => {
    const s = withTl([line('Just text.'), line('More text.')])
    expect(lintTexts(s, 'warn').join()).toMatch(/vars\.food — слово пользователя объявлено, но не используется/)
  })
  it('озвучка целой шаблонной реплики — предупреждение, а не «озвучено N из M»', () => {
    const s = withTl([line('Have {food}.', { audioUrl: 'https://x/a.mp3' }), line('Plain line.')])
    expect(lintTexts(s, 'warn').join()).toMatch(/озвучка целой реплики не используется/)
  })
})

describe('resolveSceneNode, шаблон и списки', () => {
  it('нода со шаблоном отдаёт сцену с запасными словами и без «{»', () => {
    const r = resolveSceneNode({ scene: demoTemplateScene })
    expect(r.errors).toEqual([])
    expect(JSON.stringify(r.scene)).not.toContain('{food')
    expect(r.scene.timeline[0].text).toBe('Can I have a sandwich, please?')
    expect(r.scene.vars).toBeUndefined()
  })
  it('нода с невалидным vars не проигрывается', () => {
    expect(resolveSceneNode({ scene: { ...demoTemplateScene, vars: { food: { pick: 'weak' } } } }).scene).toBeNull()
  })
  it('пометка «шаблон · N слов»', () => {
    expect(templateNote(demoTemplateScene)).toBe('шаблон · 1 слово')
    expect(templateNote({ vars: { a: {}, b: {}, c: {} } })).toBe('шаблон · 3 слова')
    expect(templateNote(demoCafeScene)).toBe('')
  })
})

describe('легенда и промпт', () => {
  it('легенда описывает vars, плейсхолдеры и пример; компактная (для уроков) — нет', () => {
    const full = sceneLegendText()
    expect(full).toMatch(/- vars:/)
    expect(full).toContain('{food:ru}')
    expect(full).toContain('{{')
    expect(sceneLegendText({ compact: true })).not.toMatch(/- vars:|{food/)
    expect(sceneLegend().varsExample.vars.food.pick).toBe('weak')
  })
  it('промпт просит шаблон только с withVars', () => {
    expect(buildPrompt('еда')).not.toMatch(/vars/)
    expect(buildPrompt('еда', { withVars: true })).toMatch(/vars/)
  })
})
