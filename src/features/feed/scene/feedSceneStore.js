import { fetchScenesByIds } from '../../../shared/api/scenesApi.js'
import { resolveSceneNode } from '../../scene/v2/sceneNode.js'
import { createSceneCache } from './feedSceneCache.js'
import { warmSceneWords } from './warmSceneWords.js'
import { SANDBOX_ID, readSandbox, onSandboxChange } from './sandbox/feedSandbox.js'

// Стор сцен ленты: по id строки `scenes` отдаёт { status, scene }.
//   status: 'idle' (не просили) | 'loading' | 'ready' | 'missing' | 'invalid'
// Запросы батчатся в микротаске: все слайды окна (активный ± 1) просят свои
// сцены в одном рендере — уходит ОДИН запрос `in (...)`. Повторно за сессию id
// не запрашивается (requested). Кэш (feedSceneCache.js): есть запись — слайд
// готов сразу, а сетевой ответ лишь подменяет сцену, если updated_at новее.
// Деградация: ошибка сети/нет таблицы/RLS не отдала → 'missing' (лента
// показывает видео), сцена не прошла validateSceneV2 → 'invalid'.
// Особый id SANDBOX_ID ('__sandbox__') — песочница админа (sandbox/feedSandbox.js): сцена из sessionStorage, status 'ready'
// без запроса в Supabase и без кэша; запись меняется — подписчики уведомляются.
// Сцены-шаблоны (vars) стор отдаёт КАК ЕСТЬ, с vars: слова пользователя и прогрев их озвучки делает слайд (SlideMedia →
// useSceneUserValues). Песочница админа получает сцену уже со словами режима админки (resolveSandbox) и прогревается здесь.
// Фабрика — чтобы тесты подставляли свой fetch/кэш/планировщик/песочницу.

export const IDLE = Object.freeze({ status: 'idle', scene: null, updatedAt: null })
const LOADING = Object.freeze({ status: 'loading', scene: null, updatedAt: null })
const MISSING = Object.freeze({ status: 'missing', scene: null, updatedAt: null })

// Строка/запись кэша → состояние: валидная сцена нормализуется, иначе 'invalid'
// Шаблон (vars) остаётся с vars: слова пользователя подставляет слайд (useSceneUserValues), стор их не знает
export const resolveFeedScene = td => resolveSceneNode(td, { fill: false })

export function resolveRow(row, resolve = resolveFeedScene) {
  const { scene } = resolve({ scene: row?.scene })
  return scene
    ? { status: 'ready', scene, updatedAt: row.updated_at ?? null }
    : { status: 'invalid', scene: null, updatedAt: row?.updated_at ?? null }
}

export function createFeedSceneStore({
  fetch = fetchScenesByIds, cache = createSceneCache(), schedule = fn => queueMicrotask(fn), resolve = resolveFeedScene,
  resolveSandbox = resolveSceneNode, // песочница админа: запасное слово или слова режимов админки — как раньше
  sandbox = { read: readSandbox, subscribe: onSandboxChange }, warm = warmSceneWords,
} = {}) {
  const entries = new Map()
  const requested = new Set()
  const subs = new Set()
  let pending = []
  let fetches = 0
  let offSandbox = null

  const notify = () => subs.forEach(fn => fn())

  async function flush() {
    const ids = pending
    pending = []
    if (!ids.length) return
    fetches += 1
    let rows = []
    try {
      rows = await fetch(ids)
    } catch {
      rows = null
    }
    const got = new Map((rows ?? []).map(r => [r.id, r]))
    for (const id of ids) {
      const row = got.get(id)
      const cur = entries.get(id)
      if (row) {
        if (cur?.status === 'ready' && cur.updatedAt && cur.updatedAt === row.updated_at) continue
        cache.put(id, row)
        entries.set(id, resolveRow(row, resolve))
      } else if (rows) {
        entries.set(id, MISSING) // сервер ответил, строки нет: снята с публикации/удалена/RLS — кэш не главнее
      } else if (!cur || cur.status === 'loading') {
        entries.set(id, MISSING) // сеть/таблица: без кэша показываем видео, с кэшем — оставляем сцену
      }
    }
    notify()
  }

  // Состояние песочницы: один объект на одну запись (useSyncExternalStore требует стабильный снимок)
  const sandboxStates = new WeakMap()
  function sandboxState() {
    const sb = sandbox.read()
    if (!sb) return MISSING
    if (!sandboxStates.has(sb)) {
      const st = resolveRow({ scene: sb.scene, updated_at: String(sb.createdAt) }, resolveSandbox)
      sandboxStates.set(sb, st)
      if (st.status === 'ready') warm(st.scene, next => { if (sandboxStates.get(sb) === st) { sandboxStates.set(sb, { ...st, scene: next }); notify() } })
    }
    return sandboxStates.get(sb)
  }

  function request(id) {
    if (!id || id === SANDBOX_ID || requested.has(id)) return
    requested.add(id)
    const cached = cache.get(id)
    entries.set(id, cached ? resolveRow(cached, resolve) : LOADING)
    if (!pending.length) schedule(flush)
    pending.push(id)
    notify()
  }

  return {
    request,
    get: id => (id === SANDBOX_ID ? sandboxState() : entries.get(id) ?? IDLE),
    // Слушатели песочницы (window) — ОДНА пара на стор, пока есть хоть один подписчик, а не по паре на каждый слайд ленты
    subscribe(fn) {
      subs.add(fn)
      if (subs.size === 1) offSandbox = sandbox.subscribe(notify)
      return () => {
        subs.delete(fn)
        if (!subs.size) { offSandbox?.(); offSandbox = null }
      }
    },
    stats: () => ({ fetches, entries: entries.size }),
  }
}

let shared = null
export function feedSceneStore() {
  if (!shared) shared = createFeedSceneStore()
  return shared
}
