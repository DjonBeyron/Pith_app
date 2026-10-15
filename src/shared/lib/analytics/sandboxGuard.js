// Песочница сцены в ленте (features/feed/scene/sandbox/) — тестовый слайд админа, не часть продукта: её события
// в аналитику не пишутся. Один id на всё: модуль ленты и «сцена» задания. Охранник стоит в track() — любое событие,
// где в props есть этот id (module_id / scene_id / from / to), молча отбрасывается.
export const SANDBOX_ID = '__sandbox__'

export function isSandboxEvent(props) {
  if (!props || typeof props !== 'object') return false
  return props.module_id === SANDBOX_ID || props.scene_id === SANDBOX_ID || props.from === SANDBOX_ID || props.to === SANDBOX_ID
}
