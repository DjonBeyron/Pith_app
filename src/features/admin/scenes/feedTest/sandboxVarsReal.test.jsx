import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { demoTemplateScene } from '../../../scene/v2/demoScenes.js'
import { normalizeCfg, buildAsUser, realSummary } from './sandboxVarsModel.js'
import SandboxVarsPanel from './SandboxVarsPanel.jsx'
import SandboxVarsReal from './SandboxVarsReal.jsx'

const scene = (pick = 'weak') => ({ ...demoTemplateScene, vars: { food: { pick, fallback: { text: 'a sandwich', translation: 'бутерброд' } } } })
const cfg = normalizeCfg({ modes: { food: { mode: 'real' } } })
const W = (text, level, due = false) => ({ key: text, text, translation: `${text}-ru`, level, due, step: level })
const stats = { total: 9, usable: 5, noTranslation: 2, notSimple: 1, due: 1, byLevel: { 1: 2, 2: 1, 3: 1, 4: 1 } }
const okState = (words = [W('cheese', 1)], st = stats, source = 'user') => ({ status: 'ok', words, stats: st, source, error: null })
const loaded = (words, seed = 'sandbox:0') => ({ loaded: true, error: null, words, seed })

describe('режим «Моя настоящая память» — модель', () => {
  it('слово из настоящей памяти, уровень и просрочка в пометке; перевод подставляется', () => {
    const r = buildAsUser(scene('due'), cfg, Math.random, loaded([W('soup', 2, true)]))
    expect(r.rows[0]).toMatchObject({ source: 'memory', level: 2, line: 'Can I have soup, please?', lineRu: 'Можно мне soup-ru, пожалуйста?' })
    expect(r.rows[0].note).toMatch(/настоящей памяти \(просрочено\)/)
  })
  it('seed стабилен; нет слов уровня 1 — запасное с объяснением', () => {
    const words = [W('cheese', 1), W('apple', 1)]
    const a = buildAsUser(scene(), cfg, Math.random, loaded(words, 's')).rows[0].word.text
    expect(buildAsUser(scene(), cfg, Math.random, loaded(words, 's')).rows[0].word.text).toBe(a)
    const fb = buildAsUser(scene(), cfg, Math.random, loaded([W('tea', 3)])).rows[0]
    expect(fb).toMatchObject({ source: 'fallback', line: 'Can I have a sandwich, please?' })
    expect(fb.note).toBe('у вас в памяти нет слов уровня 1 с переводом — показано запасное')
  })
  it('память не загружена / ошибка — запасное с понятной причиной', () => {
    expect(buildAsUser(scene(), cfg).rows[0].note).toMatch(/ещё загружается/)
    expect(buildAsUser(scene(), cfg, Math.random, { loaded: false, error: 'boom' }).rows[0].note).toMatch(/память не загружена \(boom\)/)
  })
  it('сводка', () => {
    expect(realSummary(stats)).toBe('Найдено 5 слов: уровень 1 — 2, 2 — 1, 3 — 1, 4 — 1; просрочено — 1; без перевода — 2 (не используются); фразы и составные — 1 (пока не подставляются)')
  })
})

describe('режим «Моя настоящая память» — разметка', () => {
  it('состояния: загрузка, ошибка, сводка, гость, пустая память', () => {
    expect(renderToStaticMarkup(<SandboxVarsReal state={{ status: 'loading' }} />)).toContain('Читаю вашу память')
    const err = renderToStaticMarkup(<SandboxVarsReal state={{ status: 'error', error: 'network down' }} />)
    expect(err).toContain('Не удалось прочитать память: network down')
    expect(renderToStaticMarkup(<SandboxVarsReal state={okState()} />)).toContain('Найдено 5 слов')
    expect(renderToStaticMarkup(<SandboxVarsReal state={okState([], stats, 'guest')} />)).toContain('память гостя')
    const empty = renderToStaticMarkup(<SandboxVarsReal state={okState([], { ...stats, usable: 0, noTranslation: 0, byLevel: {} })} />)
    expect(empty).toContain('нет слов с переводом')
  })
  it('панель: режим в списке, сводка, «Перевыбрать» и «Обновить память» только при режиме real', () => {
    const off = renderToStaticMarkup(<SandboxVarsPanel scene={scene()} onApply={() => {}} realInit={okState()} />)
    expect(off).toContain('Моя настоящая память') // пункт в списке режимов
    expect(off).not.toContain('Перевыбрать') // режим по умолчанию — «Из памяти (имитация)»
    const on = renderToStaticMarkup(<SandboxVarsPanel scene={scene()} onApply={() => {}} cfgInit={cfg} realInit={okState()} />)
    for (const w of ['Найдено 5 слов', 'Перевыбрать', 'Обновить память', 'Прогнать как пользователь']) expect(on).toContain(w)
    expect(on).not.toContain('Имитация памяти пользователя (') // редактор имитации скрыт
    const bad = renderToStaticMarkup(<SandboxVarsPanel scene={scene()} onApply={() => {}} cfgInit={cfg} realInit={{ status: 'error', words: [], stats: null, source: null, error: 'x' }} />)
    expect(bad).toContain('Не удалось прочитать память')
  })
})
