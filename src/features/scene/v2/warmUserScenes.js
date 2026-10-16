import { resolveSceneNode } from './sceneNode.js'
import { usesVars } from './sceneVars.js'
import { resolveUserValues } from './sceneUserResolve.js'
import { isSceneVarsEnabled } from '../../../shared/lib/memory/sceneVarsConfig.js'

// Ключ сцены-ноды для зерна выбора слова: id сцены библиотеки (одна сцена — одно слово в день во всех уроках), иначе id ноды
export const sceneNodeKey = node => node?.typeData?.scene?.sceneId ?? node?.id ?? null

// Прогрев слов пользователя для нод `scene` с vars (урок при открытии, следующая карточка повтора): выбор слов и озвучка
// слов готовятся заранее, поэтому к показу ноды SceneModule получает значения сразу, без ожидания. Один общий запрос слов
// на все ноды (sceneWordsStore). Ничего не ждёт и не бросает → число запущенных
export function warmUserSceneNodes(nodes, { resolve = resolveUserValues } = {}) {
  if (!isSceneVarsEnabled()) return 0
  let n = 0
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const raw = node?.type === 'scene' ? node.typeData?.scene?.scene : null
    if (!raw || typeof raw !== 'object' || !raw.vars) continue
    const { scene } = resolveSceneNode(node.typeData?.scene, { fill: false })
    if (!usesVars(scene)) continue
    resolve(scene, { key: sceneNodeKey(node) }).catch(() => {})
    n++
  }
  return n
}
