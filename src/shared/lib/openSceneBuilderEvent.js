// Просьба открыть «Сборщик сцен» админки из любого места приложения — кнопка «← Вернуться в сборщик» на тестовом слайде
// песочницы (feed/scene/sandbox). Событие 'pithy:open-scene-builder' с нагрузкой { id, from, origin, scene }, как
// openModuleEvent.js, но запрос ещё и ЗАПОМИНАЕТСЯ до тех пор, пока его не заберёт сборщик: админская вкладка / субвкладка
// «Сцены» могут быть не смонтированы в момент клика (ShellV2 переключает вкладку, AdminV2 — субвкладку, ScenesTab открывает окно),
// и одного события они бы не поймали.
//   from   — откуда просят ('sandbox'); origin — где сборщик был открыт до теста: 'admin' (обычный — черновик в резервной копии
//            localStorage, откроется тот же) | 'node' | 'module' (управляемый режим без резервной копии — сцена приходит в scene)
//   scene  — сцена теста (для origin ≠ 'admin'); для 'admin' не нужна: черновик восстановится из резервной копии
const EVENT = 'pithy:open-scene-builder'

let pending = null
let seq = 0
const subs = new Set()
const notify = () => subs.forEach(fn => fn())

export function requestOpenSceneBuilder({ from = 'sandbox', origin = 'admin', scene = null } = {}) {
  pending = { id: ++seq, from, origin, scene }
  notify()
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: pending })) } catch { /* нет window */ }
  return pending
}

export const peekSceneBuilderRequest = () => pending

// Сборщик забрал запрос (id — чтобы не стереть более новый)
export function consumeSceneBuilderRequest(id) {
  if (pending && pending.id === id) { pending = null; notify() }
}

export const subscribeSceneBuilderRequest = fn => { subs.add(fn); return () => subs.delete(fn) }

export function onOpenSceneBuilder(fn) {
  const h = e => fn(e.detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
