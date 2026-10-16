import SceneThumb from './SceneThumb.jsx'
import { resolveSceneNode } from '../../scene/v2/sceneNode.js'
import { usesVars } from '../../scene/v2/sceneVars.js'

// Блок «Сцена модуля в ленте»: сцена, привязанная к модулю этого урока (curricula.scene_id). Правится
// в схеме модуля; здесь — название, статус и «Открыть в редакторе» (сборщик → «В библиотеку и в ленту»)
export default function SceneModuleBlock({ moduleTitle, state, onEdit }) {
  if (!state.loaded || state.error) return null
  const { row, sceneId } = state
  if (!sceneId) return <p className="scTabModuleNone">Сцена модуля в ленте: к модулю «{moduleTitle}» не привязана (привязка — в схеме модуля, кнопка медиа).</p>
  if (!row?.scene) return <p className="scTabModuleNone" role="alert">Сцена модуля в ленте: привязанная сцена не найдена (удалена или нет доступа).</p>
  const preview = resolveSceneNode({ scene: row.scene }).scene
  const published = row.status === 'published'
  return (
    <section className="scTabModule" aria-label="Сцена модуля в ленте">
      <SceneThumb scene={preview} mode="bubble" />
      <div className="scTabBody">
        <div className="scTabHead">
          <span className="scTabNum">Лента</span>
          <span className="scTabTitle">{row.title || 'Без названия'}</span>
        </div>
        <p className="scTabModuleNote">
          Сцена модуля «{moduleTitle}» в ленте · {usesVars(row.scene) ? 'динамичная' : 'статичная'} ·{' '}
          {published ? 'опубликована' : 'черновик: лента покажет модуль без сцены'}
        </p>
        <div className="scTabActions">
          <button type="button" className="scTabBtn scTabBtn--primary scTabIconBtn" aria-label="Открыть сцену модуля в редакторе" onClick={onEdit}>Открыть в редакторе</button>
        </div>
      </div>
    </section>
  )
}
