import { feedDeepLink } from './feedTestModel.js'

// Строки блока «Тест в ленте»: модули со сценой (curricula.scene_id) + данные строки библиотеки (название, опубликована ли).
// canOpen — можно открыть: модуль и сцена опубликованы (иначе ученик/лента её не получит).
export function testRows(modules, scenes, origin = (typeof location !== 'undefined' ? location.origin : '')) {
  const byId = new Map((scenes ?? []).map(s => [s.id, s]))
  return (modules ?? []).filter(m => m.scene_id).map(m => {
    const s = byId.get(m.scene_id)
    const sceneOk = s?.status === 'published'
    const note = !s ? 'сцена не найдена' : !sceneOk ? 'сцена — черновик, опубликуйте её' : !m.published ? 'модуль не опубликован' : 'готово к проверке'
    return {
      moduleId: m.id, title: m.title || 'Без названия', sceneId: m.scene_id, sceneTitle: s?.title ?? '?',
      canOpen: sceneOk && !!m.published, note, link: feedDeepLink(m.id, origin),
    }
  })
}

export function resetMessage(n) {
  return n ? `Лимиты сброшены (очищено записей: ${n}) — задание снова можно получить в ленте` : 'Лимиты на этом устройстве уже чистые'
}
