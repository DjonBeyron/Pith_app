import PlayerBubble from '../../PlayerBubble.jsx'
import { rawSceneLines } from '../../../scene/v2/sceneNode.js'

// Сцена не выбрана или не прошла валидацию (повреждённый JSON, неизвестные
// id предметов, лишний размер) — урок не должен встать: показываем диалог
// текстом (что удалось вытащить из сырого объекта) и кнопку «Дальше»
// (onDone('played') — обычный переход). Админу — список ошибок, чтобы было
// понятно, что чинить в ноде. Предрисовке за экраном (pending) кнопка не нужна.
export default function SceneFallback({ raw, errors = [], pending = false, adminPreview = false, onDone }) {
  const lines = rawSceneLines(raw)
  return (
    <div className="playerMsgRow" data-scene-fallback="">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--sceneFallback">
        <div className="playerSceneFb">
          {lines.length
            ? lines.map((l, i) => (
              <p key={i} className={`playerSceneFbLine playerSceneFbLine--${l.who}`}>
                {l.name && <b>{l.name}: </b>}{l.text}
              </p>
            ))
            : <p className="playerSceneFbLine">{raw ? 'Сцену не удалось показать' : 'Сцена не выбрана'}</p>}
          {adminPreview && errors.length > 0 && (
            <ul className="playerSceneFbErrors" aria-label="Ошибки сцены (видно только админу)">
              {errors.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}
              {errors.length > 4 && <li>…ещё {errors.length - 4}</li>}
            </ul>
          )}
          {!pending && (
            <button type="button" className="playerSceneFbNext" onClick={() => onDone?.('played')}>Дальше</button>
          )}
        </div>
      </PlayerBubble>
    </div>
  )
}
