import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sandboxState, sandboxSteps, runSandbox, lintCounts, backupForSandbox } from './feedTestSandbox.js'
import { isMissingSceneColumn, linkErrorText, MISSING_SCENE_COLUMN_TEXT, runFeedTest, feedTestState } from './feedTestModel.js'
import FeedTestDialog from './FeedTestDialog.jsx'
import FeedSandboxBlock from './FeedSandboxBlock.jsx'
import { SANDBOX_ID } from '../../../feed/scene/sandbox/feedSandbox.js'

vi.mock('../../signals/HelpTip.jsx', () => ({ default: () => <i data-tip="" /> }))

const okLib = { busy: false, missingTable: false }
const draftOf = lint => ({ saved: { id: null, status: 'draft' }, dirty: true, errors: lint.filter(x => x.level === 'error'), lint, scene: { title: 'Кофе' } })
const noop = () => {}

describe('модель песочницы', () => {
  it('lintCounts считает ошибки и предупреждения', () => {
    expect(lintCounts([{ level: 'error' }, { level: 'warn' }, { level: 'warn' }])).toEqual({ errors: 1, warnings: 2 })
    expect(lintCounts(undefined)).toEqual({ errors: 0, warnings: 0 })
  })
  it('ошибки линтера блокируют с пояснением; предупреждения допустимы; нет сцены — блок', () => {
    expect(sandboxState({ errors: 2 })).toMatchObject({ kind: 'blocked', canRun: false })
    expect(sandboxState({ errors: 2 }).text).toMatch(/ошибки линтера \(2\)/)
    expect(sandboxState({ warnings: 3 })).toMatchObject({ kind: 'ready', canRun: true })
    expect(sandboxState({ warnings: 3 }).text).toMatch(/не блокируют/)
    expect(sandboxState({})).toMatchObject({ canRun: true })
    expect(sandboxState({ hasScene: false }).canRun).toBe(false)
  })
  it('шаги: write → force → open, галки отключают', () => {
    expect(sandboxSteps()).toEqual(['write', 'force', 'open'])
    expect(sandboxSteps({ force: false, open: false })).toEqual(['write'])
  })
  it('runSandbox: пишет сцену с taskForce, ставит force на __sandbox__, переходит и закрывает окно', () => {
    const deps = { write: vi.fn(() => true), force: vi.fn(() => true), jump: vi.fn(), close: vi.fn() }
    const res = runSandbox({ scene: { a: 1 }, deps })
    expect(res).toEqual({ ok: true, done: ['write', 'force', 'open'] })
    expect(deps.write).toHaveBeenCalledWith({ scene: { a: 1 }, taskForce: true })
    expect(deps.force).toHaveBeenCalledWith(SANDBOX_ID)
    expect(deps.jump).toHaveBeenCalledWith(SANDBOX_ID)
    expect(deps.close).toHaveBeenCalled()
  })
  it('runSandbox без галок и при сбоях', () => {
    const mk = o => ({ write: vi.fn(() => true), force: vi.fn(() => true), jump: vi.fn(), close: vi.fn(), ...o })
    let deps = mk()
    expect(runSandbox({ scene: {}, force: false, open: false, deps }).done).toEqual(['write'])
    expect(deps.force).not.toHaveBeenCalled()
    expect(deps.jump).not.toHaveBeenCalled()
    deps = mk({ write: vi.fn(() => false) })
    expect(runSandbox({ scene: {}, deps })).toMatchObject({ ok: false, failedStep: 'write' })
    expect(deps.jump).not.toHaveBeenCalled()
    deps = mk({ force: vi.fn(() => false) })
    expect(runSandbox({ scene: {}, deps })).toMatchObject({ ok: false, failedStep: 'force', done: ['write'] })
    deps = mk({ jump: vi.fn(() => { throw new Error('бум') }) })
    expect(runSandbox({ scene: {}, deps })).toMatchObject({ ok: false, error: 'бум' })
  })
  it('резервная копия черновика для панели: сцена + счётчики линтера; нет копии — null', () => {
    const load = () => ({ scene: { title: 'T' }, at: 'x' })
    expect(backupForSandbox(load, () => [{ level: 'warn' }])).toMatchObject({ errors: 0, warnings: 1, scene: { title: 'T' } })
    expect(backupForSandbox(() => null)).toBeNull()
  })
})

describe('привязка: понятное сообщение про миграцию', () => {
  const real = "Could not find the 'scene_id' column of 'curricula' in the schema cache"
  it('распознаёт по тексту и коду; чужие ошибки не трогает', () => {
    expect(isMissingSceneColumn({ message: real })).toBe(true)
    expect(isMissingSceneColumn({ message: 'column curricula.scene_id does not exist' })).toBe(true)
    expect(isMissingSceneColumn({ message: 'x', code: 'PGRST204' })).toBe(true)
    expect(isMissingSceneColumn({ message: 'RLS отказ' })).toBe(false)
    expect(isMissingSceneColumn(null)).toBe(false)
    expect(linkErrorText({ message: real })).toBe(MISSING_SCENE_COLUMN_TEXT)
    expect(MISSING_SCENE_COLUMN_TEXT).toContain('20261014150000_curricula_scene_id.sql')
    expect(linkErrorText({ message: 'RLS отказ' })).toBe('RLS отказ')
  })
  it('runFeedTest: сбой привязки отдаёт сообщение про миграцию', async () => {
    const deps = { save: async () => ({ id: 's' }), link: async () => { throw { message: real } }, force: () => true, jump: vi.fn(), close: vi.fn() } // eslint-disable-line no-throw-literal
    const res = await runFeedTest({ state: feedTestState({ saved: { id: null } }), module: { id: 'm' }, deps })
    expect(res).toMatchObject({ ok: false, failedStep: 'link', error: MISSING_SCENE_COLUMN_TEXT })
  })
})

describe('диалог «Проверить в ленте»', () => {
  const render = d => renderToStaticMarkup(<FeedTestDialog draft={d} library={okLib} save={async () => true} onClose={noop} onLeave={noop} setStatus={noop} />)
  it('по умолчанию — «Тест без привязки (песочница)», он выбран первым; второй вариант — привязка', () => {
    const html = render(draftOf([]))
    expect(html.indexOf('Тест без привязки (песочница)')).toBeLessThan(html.indexOf('Привязать к модулю ленты'))
    expect(html).toContain('aria-pressed="true">Тест без привязки (песочница)')
    expect(html).toContain('aria-pressed="false">Привязать к модулю ленты')
    expect(html).toContain('Открыть в ленте (тест)')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Открыть в ленте \(тест\)/)
    expect(html).not.toContain('Поиск модуля') // модуль, библиотека и публикация не нужны
    expect(html).not.toContain('Да, сохранить и опубликовать сцену')
  })
  it('ошибки линтера блокируют кнопку; предупреждения — нет', () => {
    const bad = render(draftOf([{ level: 'error', text: 'x' }]))
    expect(bad).toContain('Исправьте ошибки линтера (1)')
    expect(bad).toMatch(/<button[^>]*disabled=""[^>]*>Открыть в ленте \(тест\)/)
    const warn = render(draftOf([{ level: 'warn', text: 'w' }]))
    expect(warn).toContain('Предупреждений линтера: 1')
    expect(warn).not.toMatch(/<button[^>]*disabled=""[^>]*>Открыть в ленте \(тест\)/)
  })
})

describe('панель «Тест в ленте»: блок песочницы', () => {
  it('кнопки «Открыть текущий черновик в песочнице» и «Закрыть песочницу» (неактивна, пока пусто)', () => {
    const html = renderToStaticMarkup(<FeedSandboxBlock />)
    expect(html).toContain('Открыть текущий черновик в песочнице')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Закрыть песочницу/)
    expect(html).toContain('Песочница пуста')
  })
})
