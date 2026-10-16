import { applyBuilderPatch } from '../scenePickerModel.js'
import { usesVars } from '../../scene/v2/sceneVars.js'

// Действия вкладки «Сцены» над холстом — без React, чтобы тестировать с поддельным boardApi
// (CanvasBoard: getNodes, focusNode, patchNodeTypeData, addNode, duplicateNode, deleteNode).

// Строка «Открыть в редакторе»: что отдать сборщику. Берём САМ снимок (с vars у динамичной —
// не подставленный запасными словами), вкладку окна на телефоне: динамичной — «Настройки» («Слова пользователя»)
export function editRequest(api, id) {
  const n = api?.getNodes().find(x => x.id === id)
  if (!n || n.type !== 'scene') return null
  const scene = n.typeData?.scene?.scene ?? null
  return { id, scene, view: scene && usesVars(scene) ? 'settings' : 'scene' }
}

// «Применить» в сборщике: снимок в ноду так же, как в NodeScenePicker (связь с библиотекой сбрасывается, если сцену правили)
export function applySceneToNode(api, id, scene) {
  if (!id || !scene) return
  api?.patchNodeTypeData(id, td => ({ ...td, ...applyBuilderPatch(scene, { prevTd: td }) }))
}

// «+ Добавить сцену»: нода в конец урока, возвращает её id
export const addSceneNode = (api, td) => api?.addNode(null, 'scene', td) ?? null

// Действие строки по имени: api — boardApi канваса (или null), ctx — { onClose, onPlayFrom }, setEditing — открыть сборщик
export const ROW_ACTIONS = ['edit', 'go', 'play', 'dup', 'del']
export function runRowAction(kind, api, id, ctx, setEditing) {
  if (kind === 'edit') { const req = editRequest(api, id); if (req) setEditing(req) }
  else if (kind === 'go') { ctx.onClose(); api?.focusNode(id) }
  else if (kind === 'play') { ctx.onClose(); ctx.onPlayFrom?.(id) }
  else if (kind === 'dup') api?.duplicateNode(id)
  else if (kind === 'del') api?.deleteNode(id)
}
