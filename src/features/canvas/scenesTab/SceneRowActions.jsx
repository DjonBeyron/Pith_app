import { SquarePen, LocateFixed, Play, Copy, Trash2 } from 'lucide-react'

// Иконки действий строки: у каждой aria-label и title; подпись видна на телефоне (CSS).
// «Удалить» сперва спрашивает подтверждение тут же в строке.
const ACTIONS = [
  ['edit', SquarePen, 'Открыть в редакторе', 'Открыть сцену в сборщике сцен'],
  ['go', LocateFixed, 'К ноде', 'Показать ноду на холсте'],
  ['play', Play, 'Как в плеере', 'Прогнать урок с этой сцены, как у ученика'],
  ['dup', Copy, 'Дублировать', 'Копия ноды сразу после этой'],
]

export default function SceneRowActions({ seq, confirming, onAsk, onCancel, handlers, disabled }) {
  if (confirming) {
    return (
      <div className="scTabActions scTabActions--ask" role="group" aria-label="Подтверждение удаления">
        <span className="scTabAskText">Удалить ноду №{seq}?</span>
        <button type="button" className="scTabBtn scTabBtn--danger" onClick={handlers.del}>Да, удалить</button>
        <button type="button" className="scTabBtn" onClick={onCancel}>Отмена</button>
      </div>
    )
  }
  return (
    <div className="scTabActions" role="group" aria-label={`Действия со сценой №${seq}`}>
      {ACTIONS.map(([id, icon, label, hint]) => {
        const Icon = icon
        return (
        <button
          key={id} type="button" className={`scTabBtn scTabIconBtn${id === 'edit' ? ' scTabBtn--primary' : ''}`}
          aria-label={`${label} (нода №${seq})`} title={hint} onClick={handlers[id]} disabled={disabled}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="scTabBtnLabel">{label}</span>
        </button>
        )
      })}
      <button type="button" className="scTabBtn scTabIconBtn scTabBtn--danger" aria-label={`Удалить ноду №${seq}`} title="Удалить ноду из урока" onClick={onAsk}>
        <Trash2 size={16} aria-hidden="true" />
        <span className="scTabBtnLabel">Удалить</span>
      </button>
    </div>
  )
}
