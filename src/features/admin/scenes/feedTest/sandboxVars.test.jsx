import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { demoTemplateScene } from '../../../scene/v2/demoScenes.js'
import { fillSceneVars } from '../../../scene/v2/sceneVars.js'
import { seededRng } from '../../../scene/v2/sceneVarsPick.js'
import { MEMORY_LEVELS } from '../../../../shared/lib/memory/memoryLevels.js'
import { DEFAULT_MEMORY, MODES, buildAsUser, normalizeCfg } from './sandboxVarsModel.js'
import { loadSandboxVars, saveSandboxVars, SANDBOX_VARS_KEY } from './sandboxVarsStore.js'
import SandboxVarsPanel from './SandboxVarsPanel.jsx'
import SandboxVarsResult from './SandboxVarsResult.jsx'
import SandboxVarsMemory from './SandboxVarsMemory.jsx'
import FeedTestSandbox from './FeedTestSandbox.jsx'

vi.mock('../../signals/HelpTip.jsx', () => ({ default: () => <i data-tip="" /> }))

const scene = (pick = 'weak') => ({ ...demoTemplateScene, vars: { food: { pick, fallback: { text: 'a sandwich', translation: 'бутерброд' } } } })
const cfgWith = (mode, extra = {}) => normalizeCfg({ modes: { food: { mode, ...extra } } })
const fakeStorage = (init = {}) => { const m = { ...init }; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v }, m } }

describe('имитация памяти по умолчанию', () => {
  it('по слову на каждом из 5 уровней стандарта; временное не бывает просроченным', () => {
    expect(DEFAULT_MEMORY.map(w => w.level)).toEqual(MEMORY_LEVELS.map(l => l.id))
    expect(DEFAULT_MEMORY.find(w => w.level === 0).due).toBe(false)
  })
  it('режимы: запасное слово / из памяти (имитация) / вручную', () => {
    expect(Object.values(MODES)).toEqual(['Запасное слово', 'Из памяти (имитация)', 'Вручную'])
  })
})

describe('buildAsUser — подстановка как у пользователя', () => {
  it('weak берёт слово уровня 1 из имитации и подставляет в text и translation', () => {
    const r = buildAsUser(scene('weak'), cfgWith('memory'), seededRng('a'))
    expect(r.values.food).toEqual({ text: 'cheese', translation: 'сыр' })
    expect(r.scene.timeline[0].text).toBe('Can I have cheese, please?')
    expect(r.scene.timeline[0].translation).toBe('Можно мне сыр, пожалуйста?')
    expect(r.scene.vars).toBeUndefined()
    expect(r.rows[0]).toMatchObject({ name: 'food', source: 'memory', level: 1, line: 'Can I have cheese, please?', lineRu: 'Можно мне сыр, пожалуйста?' })
  })
  it('due — слово с флагом «просрочено»; known — уровни 2–4', () => {
    expect(buildAsUser(scene('due'), cfgWith('memory'), () => 0).rows[0].word.text).toBe('soup')
    const lv = new Set(Array.from({ length: 30 }, (_, i) => buildAsUser(scene('known'), cfgWith('memory'), seededRng(`k${i}`)).rows[0].level))
    expect([...lv].every(l => l >= 2 && l <= 4)).toBe(true)
  })
  it('нет слова нужного уровня → запасное, и это подписано', () => {
    const cfg = normalizeCfg({ memory: [{ text: 'tea', translation: 'чай', level: 3 }], modes: { food: { mode: 'memory' } } })
    const r = buildAsUser(scene('weak'), cfg, () => 0)
    expect(r.rows[0]).toMatchObject({ source: 'fallback', level: null })
    expect(r.rows[0].note).toBe('нет слова нужного уровня — показано запасное')
    expect(r.rows[0].line).toBe('Can I have a sandwich, please?')
    expect(r.values).toEqual({})
  })
  it('режим «Запасное слово» совпадает с обычным предпросмотром; «Вручную» берёт введённое, пустое — запасное', () => {
    const s = scene()
    expect(buildAsUser(s, cfgWith('fallback')).scene).toEqual(fillSceneVars(s, {}))
    const man = buildAsUser(s, cfgWith('manual', { text: ' apple ', translation: 'яблоко' }))
    expect(man.rows[0]).toMatchObject({ source: 'manual', line: 'Can I have apple, please?', lineRu: 'Можно мне яблоко, пожалуйста?' })
    expect(buildAsUser(s, cfgWith('manual', { text: ' ' })).rows[0].note).toMatch(/не заполнено — показано запасное/)
  })
  it('исходная сцена не меняется; одно зерно — тот же результат', () => {
    const s = scene('known')
    const copy = JSON.stringify(s)
    const a = buildAsUser(s, cfgWith('memory'), seededRng('z')).rows[0].word.text
    expect(buildAsUser(s, cfgWith('memory'), seededRng('z')).rows[0].word.text).toBe(a)
    expect(JSON.stringify(s)).toBe(copy)
  })
})

describe('хранилище sessionStorage (try/catch)', () => {
  it('сохраняет и читает; мусор и недоступное хранилище — значения по умолчанию', () => {
    const st = fakeStorage()
    const cfg = cfgWith('manual', { text: 'pear', translation: 'груша' })
    expect(saveSandboxVars(cfg, st)).toBe(true)
    expect(loadSandboxVars(st).modes.food).toMatchObject({ mode: 'manual', text: 'pear' })
    expect(loadSandboxVars(fakeStorage({ [SANDBOX_VARS_KEY]: '{не json' })).memory).toEqual(DEFAULT_MEMORY)
    const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } }
    expect(loadSandboxVars(broken).memory).toEqual(DEFAULT_MEMORY)
    expect(saveSandboxVars(cfg, broken)).toBe(false)
    expect(saveSandboxVars(cfg, null)).toBe(false)
    expect(loadSandboxVars(null).memory).toEqual(DEFAULT_MEMORY)
  })
  it('normalizeCfg чинит уровень, режим и длину; временное слово не просрочено', () => {
    const c = normalizeCfg({ memory: [{ text: 'x'.repeat(60), level: 9, due: true }, { text: 'y', level: 0, due: true }], modes: { a: { mode: 'zzz' } } })
    expect(c.memory[0]).toMatchObject({ level: 1, due: true })
    expect(c.memory[0].text).toHaveLength(40)
    expect(c.memory[1].due).toBe(false)
    expect(c.modes.a.mode).toBe('memory')
  })
})

describe('разметка панели песочницы', () => {
  it('панель: название, режимы слова, имитация памяти, кнопка, «Как это работает» с примерами', () => {
    const html = renderToStaticMarkup(<SandboxVarsPanel scene={scene()} onApply={() => {}} />)
    for (const w of ['Слова пользователя (проверка)', 'Из памяти (имитация)', 'Вручную', 'Прогнать как пользователь', 'Имитация памяти пользователя', 'Как это работает', 'Can I have cheese, please?', 'Пока не прогнано']) expect(html).toContain(w)
    expect(html).toContain('Новые слова (уровень 1, зелёные)')
    expect(html).toContain('background:var(--lvl1)')
  })
  it('без vars панель ничего не рисует, а диалог песочницы показывает её только для шаблона', () => {
    expect(renderToStaticMarkup(<SandboxVarsPanel scene={{ ...scene(), vars: undefined }} />)).toBe('')
    const draft = sc => ({ scene: sc, lint: [] })
    const props = { onClose() {}, onLeave() {}, setStatus() {} }
    expect(renderToStaticMarkup(<FeedTestSandbox draft={draft(scene())} {...props} />)).toContain('Слова пользователя (проверка)')
    expect(renderToStaticMarkup(<FeedTestSandbox draft={draft({ title: 'Кофе', timeline: [] })} {...props} />)).not.toContain('Слова пользователя (проверка)')
  })
  it('таблица: переменная → слово (уровень, цвет) → реплика; запасное — с пометкой', () => {
    const rows = buildAsUser(scene('weak'), cfgWith('memory'), () => 0).rows
    const html = renderToStaticMarkup(<SandboxVarsResult rows={rows} />)
    for (const w of ['{food}', 'cheese', 'уровень 1, новые', 'Can I have cheese, please?', 'background:var(--lvl1)']) expect(html).toContain(w)
    const fb = buildAsUser(scene('weak'), normalizeCfg({ memory: [], modes: { food: { mode: 'memory' } } })).rows
    expect(renderToStaticMarkup(<SandboxVarsResult rows={fb} />)).toContain('нет слова нужного уровня — показано запасное')
    expect(renderToStaticMarkup(<SandboxVarsResult rows={[]} />)).toBe('')
  })
  it('редактор имитации: уровни из стандарта, «просрочено» у временных заблокировано', () => {
    const html = renderToStaticMarkup(<SandboxVarsMemory memory={DEFAULT_MEMORY} onChange={() => {}} />)
    for (const l of MEMORY_LEVELS) expect(html).toContain(`${l.id} · ${l.name}`)
    expect(html).toContain('Имитация памяти пользователя (5 / 8)')
    expect(html).toMatch(/disabled=""[^>]*aria-label="Просрочено: слово 1/)
  })
})
