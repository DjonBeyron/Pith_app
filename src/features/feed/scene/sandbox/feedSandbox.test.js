import { describe, it, expect, vi, afterEach } from 'vitest'
import { readSandbox, writeSandbox, clearSandbox, parseSandbox, SANDBOX_KEY, SANDBOX_ID } from './feedSandbox.js'
import { sandboxModule, pickSandboxModule, mixSandbox } from './sandboxModule.js'
import { isSandboxEvent } from '../../../../shared/lib/analytics/sandboxGuard.js'
import { createTaskGate, setForcedSceneTask, TASK_KEY, TASK_PER_DAY, TASK_FORCE_KEY } from '../sceneTaskLimits.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

const mem = (init = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), has: k => m.has(k) }
}

afterEach(() => vi.unstubAllGlobals())

describe('песочница: запись, чтение, мусор, недоступное хранилище', () => {
  it('записывает полный JSON сцены и читает тот же объект; снимок стабилен, пока запись не менялась', () => {
    const st = mem()
    expect(writeSandbox({ scene: demoOfficeScene, taskForce: true }, { storage: st, now: () => 42 })).toBe(true)
    const a = readSandbox(st)
    expect(a).toMatchObject({ taskForce: true, createdAt: 42 })
    expect(a.scene.title).toBe(demoOfficeScene.title)
    expect(readSandbox(st)).toBe(a) // useSyncExternalStore: тот же объект
    writeSandbox({ scene: demoOfficeScene }, { storage: st, now: () => 43 })
    expect(readSandbox(st)).not.toBe(a)
    expect(readSandbox(st).taskForce).toBe(false)
  })
  it('очистка убирает запись; пусто — null', () => {
    const st = mem()
    writeSandbox({ scene: demoOfficeScene }, { storage: st })
    clearSandbox(st)
    expect(st.has(SANDBOX_KEY)).toBe(false)
    expect(readSandbox(st)).toBeNull()
  })
  it('мусор: не JSON, чужая версия, сцена не объект, нет времени, гигантская строка → null', () => {
    for (const raw of ['{{', 'null', '[]', '{"v":2,"scene":{},"createdAt":1}', '{"v":1,"scene":[],"createdAt":1}', '{"v":1,"scene":{},"createdAt":"x"}', 'x'.repeat(1_600_000)]) {
      expect(parseSandbox(raw)).toBeNull()
      expect(readSandbox(mem({ [SANDBOX_KEY]: raw }))).toBeNull()
    }
    expect(parseSandbox(null)).toBeNull()
  })
  it('хранилище недоступно или бросает — не падает, запись не удалась', () => {
    const boom = { getItem() { throw new Error('x') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('x') } }
    expect(readSandbox(boom)).toBeNull()
    expect(writeSandbox({ scene: demoOfficeScene }, { storage: boom })).toBe(false)
    expect(() => clearSandbox(boom)).not.toThrow()
    expect(writeSandbox({ scene: demoOfficeScene }, { storage: null })).toBe(false)
    expect(writeSandbox({ scene: 'не объект' }, { storage: mem() })).toBe(false)
  })
  it('слишком большая сцена не пишется', () => {
    const st = mem()
    expect(writeSandbox({ scene: { title: 'x'.repeat(1_600_000) } }, { storage: st })).toBe(false)
    expect(st.has(SANDBOX_KEY)).toBe(false)
  })
  it('пишет событие для живой подписки (window.dispatchEvent)', () => {
    const dispatch = vi.fn()
    vi.stubGlobal('window', { dispatchEvent: dispatch })
    vi.stubGlobal('CustomEvent', class { constructor(t) { this.type = t } })
    writeSandbox({ scene: demoOfficeScene }, { storage: mem() })
    clearSandbox(mem())
    expect(dispatch).toHaveBeenCalledTimes(2)
  })
})

describe('синтетический модуль: только админ, без видео и уроков, в начале круга', () => {
  const sb = { scene: { title: 'Кофе' }, taskForce: false, createdAt: 7 }
  it('форма модуля', () => {
    const m = sandboxModule(sb)
    expect(m).toMatchObject({ id: SANDBOX_ID, sceneId: SANDBOX_ID, title: 'Кофе', isSandbox: true, videoUrl: null, lessonIds: [], previewOnly: true, feedCatchEnabled: false, sandboxAt: 7 })
    expect(sandboxModule({ ...sb, scene: {} }).title).toBe('Тест сцены')
  })
  it('обычному пользователю и без записи — null; админу — модуль', () => {
    expect(pickSandboxModule(false, sb)).toBeNull()
    expect(pickSandboxModule(true, null)).toBeNull()
    expect(pickSandboxModule(true, sb).id).toBe(SANDBOX_ID)
  })
  it('в начало списка, остальной порядок не тронут; без модуля — тот же массив', () => {
    const ranked = [{ id: 'a' }, { id: 'b' }]
    expect(mixSandbox(ranked, null)).toBe(ranked)
    expect(mixSandbox(ranked, pickSandboxModule(true, sb)).map(m => m.id)).toEqual([SANDBOX_ID, 'a', 'b'])
  })
  it('useFeedModules берёт эффективный isAdmin (гаснет в «режиме пользователя») и подмешивает через mixSandbox', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../../useFeedModules.js', import.meta.url), 'utf8')
    expect(src).toContain('const { isAdmin } = useAdmin()')
    expect(src).toContain('useSandboxModule(isAdmin)')
    expect(src).toContain('mixSandbox(laddered, sandboxMod)') // laddered — ranked после «лесенки» второго визита (ladder/)
    const rd = f => readFileSync(new URL(f, import.meta.url), 'utf8')
    expect(rd('../../FeedTab.jsx')).toContain('m.id === pinnedId || m.isSandbox ||') // фильтр сложности песочницу не прячет
    expect(rd('../../useFeedTracking.js')).toContain('!module.isSandbox') // feed_view не пишется
  })
})

describe('аналитика не пишет песочницу', () => {
  it('охранник узнаёт module_id / scene_id / from / to; обычные события проходят', () => {
    expect(isSandboxEvent({ module_id: SANDBOX_ID, ms: 5 })).toBe(true)
    expect(isSandboxEvent({ scene_id: SANDBOX_ID, kind: 'say' })).toBe(true)
    expect(isSandboxEvent({ from: 'm1', to: SANDBOX_ID })).toBe(true)
    expect(isSandboxEvent({ from: SANDBOX_ID, to: 'm1' })).toBe(true)
    expect(isSandboxEvent({ module_id: 'm1' })).toBe(false)
    expect(isSandboxEvent(null)).toBe(false)
    expect(isSandboxEvent(undefined)).toBe(false)
  })
})

describe('принудительное задание песочницы', () => {
  const mk = () => {
    const local = mem(); const session = mem()
    const gate = createTaskGate({ storage: () => local, session: () => session, today: () => '2026-10-15', now: () => 1 })
    return { local, session, gate }
  }
  it('при исчерпанном дневном лимите без force не показывает, с force показывает один раз и лимит не тратит', () => {
    const { local, session, gate } = mk()
    const full = JSON.stringify({ date: '2026-10-15', count: TASK_PER_DAY, scenes: {} })
    local.setItem(TASK_KEY, full)
    expect(gate.claim(SANDBOX_ID)).toBe(false)
    vi.stubGlobal('sessionStorage', session)
    expect(setForcedSceneTask(SANDBOX_ID)).toBe(true)
    expect(gate.forced(SANDBOX_ID)).toBe(true)
    expect(gate.claim(SANDBOX_ID)).toBe(true)
    expect(local.getItem(TASK_KEY)).toBe(full) // счётчик дня не тронут
    expect(session.has(TASK_FORCE_KEY)).toBe(false) // force снят
    expect(gate.claim(SANDBOX_ID)).toBe(false)
  })
  it('без force песочница подчиняется лимитам, но счётчики сама не пишет: тест можно повторять сколько угодно', () => {
    const { local, gate } = mk()
    expect(gate.claim(SANDBOX_ID)).toBe(true)
    expect(local.getItem(TASK_KEY)).toBe(null) // «сцена раз в сутки» и счётчик дня не тронуты
    gate.onSlide('a'); gate.onSlide('b'); gate.onSlide('c')
    expect(gate.claim(SANDBOX_ID)).toBe(true)
  })
  it('лимит дня исчерпан → отказ с видимой причиной; паузу «Спроси позже» песочница не пишет', () => {
    const { local, gate } = mk()
    local.setItem(TASK_KEY, JSON.stringify({ date: '2026-10-15', count: TASK_PER_DAY, scenes: {} }))
    expect(gate.claim(SANDBOX_ID)).toBe(false)
    expect(gate.why(SANDBOX_ID)).toMatch(/лимит/)
    gate.later(SANDBOX_ID)
    expect(local.getItem('pithy_scene_task_later_v1')).toBe(null)
  })
})
