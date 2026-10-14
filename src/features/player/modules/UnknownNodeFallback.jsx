import { useState } from 'react'
import PlayerBubble from '../PlayerBubble.jsx'
import { haptic } from '../../../shared/lib/haptics.js'
import { purgeShellAndReload } from '../../../shared/lib/shellClient.js'

// Фолбэк для типа ноды, которого нет в этой сборке (ученик на устаревшей
// версии, а в уроке уже новый тип). Без него resolveModule давал null, onDone
// не вызывался — урок вставал навсегда. Автопрохода нет: ученик сам выбирает —
// «Обновить» (сброс кеша оболочки + reload: новая сборка точно придёт с сети;
// useUpdateAvailable тут не годится — посреди урока он молчит) или «Пропустить»
// (onDone('played') — обычный переход дальше по графу). Превью-ноде (pending,
// за экраном) и истории кнопки не нужны: onDone там заглушка/не нужен.
export default function UnknownNodeFallback({ node, pending, onDone }) {
  const [offline, setOffline] = useState(false)

  function handleUpdate() {
    haptic()
    if (!navigator.onLine) { setOffline(true); return }
    setOffline(false)
    setTimeout(() => purgeShellAndReload(), 90)
  }

  function handleSkip() {
    haptic()
    onDone?.('played')
  }

  return (
    <div className="playerMsgRow" data-unknown-type={node.type}>
      <PlayerBubble className="playerMsgBubble">
        <div className="playerUnknownNode">
          <span className="playerUnknownText">
            {offline ? 'Нет сети. Подключись и попробуй снова' : 'Этот фрагмент требует обновления приложения'}
          </span>
          {!pending && (
            <span className="playerUnknownBtns">
              <button type="button" className="playerUnknownSkip" onClick={handleSkip}>Пропустить</button>
              <button type="button" className="playerUnknownUpdate" onClick={handleUpdate}>Обновить</button>
            </span>
          )}
        </div>
      </PlayerBubble>
    </div>
  )
}
