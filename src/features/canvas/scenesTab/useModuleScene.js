import { useCallback, useEffect, useState } from 'react'
import { loadCurriculumMedia, updateCurriculumScene } from '../../../shared/lib/curriculaApi.js'
import { getScene, saveScene } from '../../../shared/api/scenesApi.js'
import { builderSavePayload } from '../../lessons/moduleSceneModel.js'

// Сцена модуля в ленте (curricula.scene_id → scenes) для блока вкладки «Сцены». Читается, только
// пока вкладка открыта (enabled) и модуль известен: два лёгких запроса (media модуля → строка сцены).
// Ошибки сети/прав блок не ломают — он просто не показывается (state 'error').
export function useModuleScene(moduleId, enabled) {
  const [res, setRes] = useState({ forId: null, tick: 0, row: null, sceneId: null, error: false })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled || !moduleId) return undefined
    let alive = true
    loadCurriculumMedia(moduleId)
      .then(async m => ({ sceneId: m?.scene_id ?? null, row: m?.scene_id ? await getScene(m.scene_id) : null }))
      .then(r => { if (alive) setRes({ forId: moduleId, tick, ...r, error: false }) })
      .catch(() => { if (alive) setRes({ forId: moduleId, tick, row: null, sceneId: null, error: true }) })
    return () => { alive = false }
  }, [moduleId, enabled, tick])

  // «Применить» из сборщика: сохранить в библиотеку (та же строка) и оставить привязку к модулю
  const apply = useCallback(async (scene, saved) => {
    const row = await saveScene(builderSavePayload(scene, saved))
    await updateCurriculumScene(moduleId, row.id)
    setTick(t => t + 1)
  }, [moduleId])

  const loaded = !!moduleId && res.forId === moduleId && res.tick === tick
  return { loaded, error: loaded && res.error, sceneId: loaded ? res.sceneId : null, row: loaded ? res.row : null, apply }
}
