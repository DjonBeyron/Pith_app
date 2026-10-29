import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GameTestBlock from './GameTestBlock.jsx'
import GameTestRehearsal from './GameTestRehearsal.jsx'
import { loadRehearsalForm, saveRehearsalForm, parsePlanJson, textRows, fixtureJson, defaultRehearsalForm, REHEARSAL_TEST_KEY } from '../../rehearsal/rehearsalTestForm.js'
import { FIXTURE_IDS, fixturePlan } from '../../rehearsal/rehearsalFixtures.js'

vi.mock('../../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) })) // фоновая загрузка Vosk не рендерится на сервере

// Админ → «Голос» → «Тест игры» → переключатель «Нода (как сейчас)» / «Репетиция (симуляция)»: фикстура, JSON плана, озвучка, запуск
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
afterEach(() => vi.unstubAllGlobals())
const form = (o = {}) => ({ ...defaultRehearsalForm(), mode: 'rehearsal', ...o })
const render = (f = form(), lib = new Map()) => renderToStaticMarkup(createElement(GameTestRehearsal, { form: f, onChange() {}, lib, generate() {} }))

describe('форма репетиции в браузере админа', () => {
  it('по умолчанию режим «нода», фикстура «три куска», JSON — исходник плана', () => {
    const f = loadRehearsalForm(memStore())
    expect(f).toEqual({ mode: 'node', fixture: 'three', json: fixtureJson('three') })
    expect(JSON.parse(f.json).phrase).toBe("I'm | trying | to learn")
  })
  it('сохраняется (режим, фикстура, правленый JSON); мусор, чужая фикстура, приватный режим — по умолчанию', () => {
    const s = memStore()
    saveRehearsalForm({ mode: 'rehearsal', fixture: 'one', json: '{"phrase":"go"}' }, s)
    expect(JSON.parse(s.m[REHEARSAL_TEST_KEY])).toEqual({ mode: 'rehearsal', fixture: 'one', json: '{"phrase":"go"}' })
    expect(loadRehearsalForm(s)).toEqual({ mode: 'rehearsal', fixture: 'one', json: '{"phrase":"go"}' })
    expect(loadRehearsalForm(memStore({ [REHEARSAL_TEST_KEY]: '{не json' }))).toEqual(defaultRehearsalForm())
    expect(loadRehearsalForm(memStore({ [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'x', fixture: 'нет', json: '  ' }) }))).toEqual(defaultRehearsalForm())
    const broken = { getItem() { throw new Error('p') }, setItem() { throw new Error('p') } }
    expect(loadRehearsalForm(broken)).toEqual(defaultRehearsalForm()); expect(() => saveRehearsalForm(form(), broken)).not.toThrow()
  })
  it('parsePlanJson: JSON → нормализованный план (источник sim) или понятная ошибка', () => {
    expect(parsePlanJson(fixtureJson('two')).plan.chunks).toEqual(['Nice', 'to meet you'])
    expect(parsePlanJson(fixtureJson('two')).plan.source).toBe('sim')
    expect(parsePlanJson('{не json').error).toMatch(/^Не JSON/)
    expect(parsePlanJson('{"phrase":" | "}').error).toMatch(/нет ни одного куска/)
    expect(parsePlanJson('null').plan).toBeNull()
  })
  it('textRows: куски, слова и двойники плана с признаком «есть в библиотеке»', () => {
    const rows = textRows(fixturePlan('three'), new Map([['learn', { url: 'x' }]]))
    expect(rows.find(r => r.text === 'learn')).toMatchObject({ key: 'learn', has: true })
    expect(rows.find(r => r.text === 'earn')).toMatchObject({ has: false })
    expect(textRows(fixturePlan('three'), null).every(r => !r.has)).toBe(true)
  })
})

describe('блок «Тест игры»: переключатель режимов', () => {
  it('по умолчанию режим «Нода (как сейчас)»: форма фразы на месте, переключатель есть, режим «Репетиция (симуляция)» не нажат', () => {
    vi.stubGlobal('localStorage', memStore())
    const out = renderToStaticMarkup(createElement(GameTestBlock))
    expect(out).toContain('data-testid="game-test-mode"'); expect(out).toContain('Нода (как сейчас)'); expect(out).toContain('Репетиция (симуляция)')
    expect(out).toMatch(/aspChip aspChipOn"[^>]*aria-pressed="true"[^>]*data-testid="game-test-mode-node"/)
    expect(out).toContain('data-testid="game-test-phrase"'); expect(out).toContain('Запустить игру'); expect(out).not.toContain('rh-test-json')
  })
  it('режим «Репетиция» из сохранённых настроек: фикстура, JSON плана, «Озвучить», «Запустить репетицию»', () => {
    vi.stubGlobal('localStorage', memStore({ [REHEARSAL_TEST_KEY]: JSON.stringify({ mode: 'rehearsal', fixture: 'three', json: fixtureJson('three') }) }))
    const out = renderToStaticMarkup(createElement(GameTestBlock))
    expect(out).toMatch(/aspChip aspChipOn"[^>]*aria-pressed="true"[^>]*data-testid="game-test-mode-rehearsal"/)
    for (const id of ['rh-test-fixture', 'rh-test-json', 'rh-test-voice', 'rh-test-start', 'rh-test-rows']) expect(out).toContain(`data-testid="${id}"`)
    expect(out).toContain('Запустить репетицию'); expect(out).not.toContain('game-test-phrase')
  })
})

describe('режим «Репетиция (симуляция)»', () => {
  it('выбор фикстуры: все четыре с названиями; JSON плана — редактируемое поле', () => {
    const out = render()
    for (const id of FIXTURE_IDS) expect(out).toContain(`<option value="${id}"`)
    expect(out).toContain('Три куска, двойник learn / earn / lean'); expect(out).toContain('Одно слово')
    expect(out).toMatch(/<textarea[^>]*data-testid="rh-test-json"/)
    expect(out).toContain('&quot;phrase&quot;: &quot;I&#x27;m | trying | to learn&quot;')
  })
  it('«Озвучить»: список кусков, слов и двойников плана с «есть / нет озвучки» и счётчик реплик Пита', () => {
    const out = render(form(), new Map([['learn', { url: 'x' }]]))
    expect(out).toMatch(/«learn» — <span class="aspOk">есть озвучка/); expect(out).toMatch(/«earn» — <span class="aspBad">нет озвучки/)
    expect(out).toMatch(/Реплики Пита: озвучено 0 из \d+/)
    expect(out).toContain('Озвучить (')
  })
  it('битый JSON: ошибка на экране, запуска нет, списка слов нет', () => {
    const out = render(form({ json: '{oops' }))
    expect(out).toContain('data-testid="rh-test-error"'); expect(out).toContain('Не JSON')
    expect(out).toMatch(/data-testid="rh-test-start"[^>]*disabled|disabled=""[^>]*data-testid="rh-test-start"/)
    expect(out).not.toContain('class="playerRotateStart"')
  })
  it('запуск — тот же RotatePhoneModule с синтетической нодой { rotate_phone: { plan } }, forceDebug, тап кнопки зовёт start() (жест)', () => {
    const src = read('./GameTestRehearsal.jsx')
    expect(src).toContain("typeData: { rotate_phone: { plan } }")
    expect(src).toContain('<RotatePhoneModule key={rev} node={node} bare forceDebug startRef={startRef}')
    expect(src).toContain('onClick={() => startRef.current?.()}')
    expect(src).toContain("runs > 0 ? 'Ещё раз' : 'Запустить репетицию'")
    expect(src).toContain('generate(r.key, r.text)')
    expect(src).toContain('voiceMissingPitLines({ onStep: setVoicing })')
    const block = read('./GameTestBlock.jsx')
    expect(block).toContain('<GameTestRehearsal form={rform} onChange={changeR} lib={lib} generate={generate} />')
    expect(block).toContain("Репетиция (симуляция)")
  })
  it('режим на старте блокируется во время игры (кнопки режима и озвучка disabled при playing)', () => {
    const block = read('./GameTestBlock.jsx')
    expect(block).toContain('disabled={playing}')
    expect(read('./GameTestRehearsal.jsx')).toContain('disabled={!!voicing || playing')
  })
})
