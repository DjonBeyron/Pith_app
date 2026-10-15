import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { feedTestState, feedTestSteps, feedDeepLink, runFeedTest, moduleNote, feedPushMessage, FEED_TEST_HOWTO } from './feedTestModel.js'
import { resetSceneTaskLimits } from './resetTaskLimits.js'
import { testRows, resetMessage } from './feedTestList.js'
import { TASK_KEY, TASK_LATER_KEY, TASK_LATER_STREAK_KEY, TASK_FORCE_KEY } from '../../../feed/scene/sceneTaskLimits.js'
import FeedTestDialog from './FeedTestDialog.jsx'
import FeedTestHowTo from './FeedTestHowTo.jsx'
import { buildToolbarActions } from '../toolbar/toolbarModel.js'

vi.mock('../../signals/HelpTip.jsx', () => ({ default: () => <i data-tip="" /> }))

const mem = (init = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), has: k => m.has(k) }
}

describe('feedTestState — что делать со сценой перед проверкой', () => {
  it('нет в библиотеке → сохранить и опубликовать одним шагом', () => {
    const s = feedTestState({ saved: { id: null, status: 'draft' }, dirty: false })
    expect(s).toMatchObject({ kind: 'save', needsSave: true })
    expect(s.text).toMatch(/сохраню и опубликую одним шагом/)
  })
  it('черновик в библиотеке → publish; опубликована с правками → save; чистая опубликованная → ready', () => {
    expect(feedTestState({ saved: { id: 'a', status: 'draft' } }).kind).toBe('publish')
    expect(feedTestState({ saved: { id: 'a', status: 'published' }, dirty: true }).kind).toBe('save')
    expect(feedTestState({ saved: { id: 'a', status: 'published' } })).toMatchObject({ kind: 'ready', needsSave: false })
  })
  it('ошибки линтера или нет таблицы блокируют только если нужно сохранять', () => {
    expect(feedTestState({ saved: { id: null }, errors: 2 })).toMatchObject({ kind: 'blocked' })
    expect(feedTestState({ saved: { id: 'a', status: 'published' }, errors: 2 }).kind).toBe('ready')
    expect(feedTestState({ saved: { id: null }, missingTable: true }).kind).toBe('blocked')
  })
})

describe('feedTestSteps / feedDeepLink / moduleNote', () => {
  const ready = feedTestState({ saved: { id: 'sc', status: 'published' } })
  const fresh = feedTestState({ saved: { id: null } })
  it('порядок шагов: save → link → force → open; уже привязана — link пропускается; галки отключают force/open', () => {
    expect(feedTestSteps({ state: fresh, module: { id: 'm' }, savedId: null })).toEqual(['save', 'link', 'force', 'open'])
    expect(feedTestSteps({ state: ready, module: { id: 'm', scene_id: 'sc' }, savedId: 'sc' })).toEqual(['force', 'open'])
    expect(feedTestSteps({ state: ready, module: { id: 'm', scene_id: 'other' }, savedId: 'sc', force: false, open: false })).toEqual(['link'])
  })
  it('deep-link ленты — ?m=<id> (его читает useFeedModules)', () => {
    expect(feedDeepLink('abc-1', 'https://x.app')).toBe('https://x.app/?m=abc-1')
    expect(feedDeepLink('a b', '')).toBe('/?m=a%20b')
    expect(feedDeepLink(null)).toBe('')
  })
  it('пометка модуля: уже привязана / другая / видео / без медиа / не опубликован', () => {
    expect(moduleNote({ scene_id: 's', published: true }, 's')).toBe('уже привязана')
    expect(moduleNote({ scene_id: 'o', published: true }, 's')).toMatch(/заменится/)
    expect(moduleNote({ video_url: 'v', published: true }, 's')).toMatch(/видео/)
    expect(moduleNote({ published: false }, 's')).toBe('без медиа · не опубликован')
  })
})

describe('runFeedTest — запуск цепочки', () => {
  const mkDeps = (over = {}) => ({
    save: vi.fn(async () => ({ id: 'new-scene' })), link: vi.fn(async () => {}), force: vi.fn(() => true), jump: vi.fn(), close: vi.fn(), ...over,
  })
  const mod = { id: 'mod-1', scene_id: null }
  it('сцены нет: публикует, привязывает новый id, ставит принудительный показ, переходит и закрывает окно', async () => {
    const deps = mkDeps()
    const res = await runFeedTest({ state: feedTestState({ saved: { id: null } }), module: mod, savedId: null, deps })
    expect(res).toMatchObject({ ok: true, done: ['save', 'link', 'force', 'open'], sceneId: 'new-scene' })
    expect(deps.save).toHaveBeenCalledWith('published')
    expect(deps.link).toHaveBeenCalledWith('mod-1', 'new-scene')
    expect(deps.force).toHaveBeenCalledWith('new-scene')
    expect(deps.jump).toHaveBeenCalledWith('mod-1')
    expect(deps.close).toHaveBeenCalled()
  })
  it('сохранённая и привязанная: только принудительный показ и переход', async () => {
    const deps = mkDeps()
    const res = await runFeedTest({ state: feedTestState({ saved: { id: 'sc', status: 'published' } }), module: { id: 'm', scene_id: 'sc' }, savedId: 'sc', deps })
    expect(res.done).toEqual(['force', 'open'])
    expect(deps.save).not.toHaveBeenCalled()
    expect(deps.link).not.toHaveBeenCalled()
  })
  it('без галок: только привязка, ленту не открывает и окно не закрывает', async () => {
    const deps = mkDeps()
    const res = await runFeedTest({ state: feedTestState({ saved: { id: 'sc', status: 'published' } }), module: mod, savedId: 'sc', force: false, open: false, deps })
    expect(res.done).toEqual(['link'])
    expect(deps.force).not.toHaveBeenCalled()
    expect(deps.jump).not.toHaveBeenCalled()
    expect(deps.close).not.toHaveBeenCalled()
  })
  it('ошибки: не сохранилась → стоп до привязки; привязка упала → сообщение и failedStep; sessionStorage недоступен', async () => {
    let deps = mkDeps({ save: vi.fn(async () => false) })
    let res = await runFeedTest({ state: feedTestState({ saved: { id: null } }), module: mod, deps })
    expect(res).toMatchObject({ ok: false, failedStep: 'save', done: [] })
    expect(deps.link).not.toHaveBeenCalled()
    deps = mkDeps({ link: vi.fn(async () => { throw new Error('RLS отказ') }) })
    res = await runFeedTest({ state: feedTestState({ saved: { id: null } }), module: mod, deps })
    expect(res).toMatchObject({ ok: false, failedStep: 'link', error: 'RLS отказ', done: ['save'] })
    expect(deps.jump).not.toHaveBeenCalled()
    deps = mkDeps({ force: vi.fn(() => false) })
    res = await runFeedTest({ state: feedTestState({ saved: { id: 'sc', status: 'published' } }), module: { id: 'm', scene_id: 'sc' }, savedId: 'sc', deps })
    expect(res).toMatchObject({ ok: false, failedStep: 'force' })
    expect(deps.jump).not.toHaveBeenCalled()
  })
  it('сообщение принудительного показа', () => {
    expect(feedPushMessage(true).kind).toBe('ok')
    expect(feedPushMessage(false).kind).toBe('error')
  })
})

describe('сброс лимитов задания на устройстве', () => {
  it('чистит ключи day/later/streak в localStorage и force в sessionStorage, чужие не трогает', () => {
    const storage = mem({ [TASK_KEY]: '{}', [TASK_LATER_KEY]: '{}', [TASK_LATER_STREAK_KEY]: '{}', other: '1' })
    const session = mem({ [TASK_FORCE_KEY]: '{"sceneId":"x"}', s2: '1' })
    expect(resetSceneTaskLimits({ storage, session })).toBe(4)
    for (const k of [TASK_KEY, TASK_LATER_KEY, TASK_LATER_STREAK_KEY]) expect(storage.has(k)).toBe(false)
    expect(storage.has('other') && session.has('s2')).toBe(true)
    expect(session.has(TASK_FORCE_KEY)).toBe(false)
    expect(resetSceneTaskLimits({ storage, session })).toBe(0)
    expect(resetMessage(0)).toMatch(/чистые/)
    expect(resetMessage(3)).toMatch(/3/)
  })
  it('хранилища нет или бросает — не падает', () => {
    expect(resetSceneTaskLimits({ storage: null, session: null })).toBe(0)
    const bad = { getItem() { throw new Error('x') }, removeItem() {} }
    expect(resetSceneTaskLimits({ storage: bad, session: null })).toBe(0)
  })
})

describe('блок «Тест в ленте»: строки', () => {
  const scenes = [{ id: 's1', title: 'Кофе', status: 'published' }, { id: 's2', title: 'Черновик', status: 'draft' }]
  const mods = [
    { id: 'm1', title: 'Модуль 1', scene_id: 's1', published: true },
    { id: 'm2', title: 'Модуль 2', scene_id: 's2', published: true },
    { id: 'm3', title: 'Без сцены', scene_id: null, published: true },
    { id: 'm4', title: 'Не опубл.', scene_id: 's1', published: false },
    { id: 'm5', title: 'Потеряна', scene_id: 'gone', published: true },
  ]
  it('только модули со сценой; открыть можно лишь при опубликованных сцене и модуле; есть deep-link', () => {
    const rows = testRows(mods, scenes, 'https://a.b')
    expect(rows.map(r => r.moduleId)).toEqual(['m1', 'm2', 'm4', 'm5'])
    expect(rows.map(r => r.canOpen)).toEqual([true, false, false, false])
    expect(rows[0]).toMatchObject({ sceneTitle: 'Кофе', link: 'https://a.b/?m=m1' })
    expect(rows[1].note).toMatch(/черновик/)
    expect(rows[3].note).toMatch(/не найдена/)
  })
})

describe('разметка и тулбар', () => {
  const draft = { saved: { id: null, status: 'draft' }, dirty: false, errors: [] }
  it('диалог: состояние сцены, чекбокс подтверждения сохранения, две галки, инструкция про микрофон, кнопка заблокирована без модуля', () => {
    const html = renderToStaticMarkup(<FeedTestDialog draft={draft} library={{ busy: false, missingTable: false }} save={async () => true} onClose={() => {}} onLeave={() => {}} setStatus={() => {}} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('сохраню и опубликую одним шагом')
    expect(html).toContain('Да, сохранить и опубликовать сцену')
    expect(html).toContain('Показать задание сразу (принудительно, лимиты не тратить)')
    expect(html).toContain('Открыть ленту на этом слайде')
    expect(html).toContain('разрешите микрофон')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Проверить в ленте<\/button>/)
  })
  it('инструкция: три шага, первый про микрофон', () => {
    expect(FEED_TEST_HOWTO).toHaveLength(3)
    expect(renderToStaticMarkup(<FeedTestHowTo />)).toContain('микрофон')
  })
  it('тулбар: кнопка «Проверить в ленте» появляется только когда передана', () => {
    const base = { mode: 'admin', save: { label: 'С', run() {} }, onNew() {}, theme: 'dark', onToggleTheme() {} }
    expect(buildToolbarActions(base).some(a => a.id === 'feedTest')).toBe(false)
    const l = buildToolbarActions({ ...base, feedTest: { run() {}, hint: 'x' } })
    expect(l.map(a => a.id)).toEqual(['save', 'feedTest', 'new', 'theme'])
    expect(l.find(a => a.id === 'feedTest').group).toBe('scene')
  })
})
