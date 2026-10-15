import { setForcedSceneTask } from '../../../feed/scene/sceneTaskLimits.js'
import { sendToFeed } from '../../../feed/catch/catchForce.js'

// «Открыть в ленте с заданием»: принудительный показ задания сцены (лимиты не тратятся) и поворот ленты к модулю
// с переключением на вкладку ленты. → false, если принудительный показ не записался (sessionStorage недоступен).
export function openSceneInFeed({ moduleId, sceneId, force = true }) {
  if (!moduleId) return false
  if (force && sceneId && !setForcedSceneTask(sceneId)) return false
  sendToFeed(moduleId)
  return true
}
