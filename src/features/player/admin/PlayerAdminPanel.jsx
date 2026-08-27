import { useState } from 'react'
import NodeContentEditor from '../../canvas/NodeContentEditor.jsx'
import PlayerStepBar from './PlayerStepBar.jsx'
import { nodeEditLabel } from './playerEditLabel.js'

// Правая панель редактора рядом с «телефоном» плеера (десктоп, только админ,
// только запуск из канваса). Внутри — тот же NodeContentEditor, что в max-ноде
// канваса и в строке продакшена: один источник правды на все типы нод, чтобы
// правка текста, цвета, переносов и файла работала одинаково везде.
//
// Правка уходит сразу вживую: onUpdate меняет ноду на холсте, холст возвращает
// её в плеер пропом — пузырь перерисовывается на месте, без перезапуска урока.
export default function PlayerAdminPanel({
  node, nodes, currentId, onPick, onClose,
  onUpdate, lessonFiles = [], onPickLessonFile, moduleLessons = [],
  // Пошаговое управление прогоном (usePlayerStepControl)
  step, onExitToNode,
}) {
  // Блок «Если/Тогда» — свёрнут по умолчанию: он длинный, а правят чаще текст
  // и медиа. Рамка позиционирования медиа при этом раскрыта, как в ноде
  const [trOpen, setTrOpen] = useState(false)

  // Ноду для полей держим локально. Правка уходит на холст сразу, но обратно
  // в плеер нода возвращается с задержкой (лента обновляется раз в 500 мс) —
  // и поле, читая ноду из пропа, отставало от набора: каретка прыгала, буквы
  // «проглатывались». Черновик показывает то, что набрано, не дожидаясь круга.
  // Черновик помечен id ноды: выбрали другое сообщение — он просто перестаёт
  // подходить, и поля снова читают ноду из пропа. Отдельный сброс не нужен
  const [draft, setDraft] = useState(null)

  const shownNode = draft?.id && draft.id === node?.id ? draft.node : node

  function handleUpdate(patch) {
    if (!shownNode) return
    setDraft({ id: shownNode.id, node: { ...shownNode, ...patch } })
    onUpdate(shownNode.id, patch)
  }

  const ordered = [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  return (
    <aside className="playerEditPanel" onMouseDown={e => e.stopPropagation()}>
      <div className="playerEditPanelHead">
        <select
          className="playerEditPanelSelect"
          value={node?.id ?? ''}
          onChange={e => onPick(e.target.value)}
        >
          {!node && <option value="">— выбери сообщение —</option>}
          {ordered.map(n => (
            <option key={n.id} value={n.id}>{nodeEditLabel(n)}</option>
          ))}
        </select>
        <button
          className="playerEditPanelBtn"
          title="Перейти к сообщению, которое идёт сейчас"
          disabled={!currentId}
          onClick={() => onPick(currentId)}
        >⌖</button>
        <button className="playerEditPanelBtn" title="Закрыть панель" onClick={onClose}>✕</button>
      </div>

      <PlayerStepBar
        paused={step.paused}
        frozen={step.frozen}
        onTogglePause={step.togglePause}
        onBack={step.back}
        onForward={step.forward}
        canBack={step.canBack}
        answerCorrect={step.answerCorrect}
        onToggleAnswer={() => step.setAnswerCorrect(v => !v)}
        canExit={!!node && !!onExitToNode}
        onExitToNode={() => onExitToNode?.(node.id)}
      />

      <div className="playerEditPanelBody">
        {shownNode ? (
          <NodeContentEditor
            key={shownNode.id}
            node={shownNode}
            onUpdate={handleUpdate}
            allNodes={ordered}
            lessonFiles={lessonFiles}
            onPickLessonFile={onPickLessonFile}
            moduleLessons={moduleLessons}
            collapsibleTriggers
            triggersExpanded={trOpen}
            onToggleTriggers={() => setTrOpen(v => !v)}
            growTextareas
          />
        ) : (
          <p className="playerEditPanelHint">
            Наведи на сообщение в чате и нажми ✎ — здесь откроются все настройки ноды.
            Правки уходят в холст сразу; на сервер — по «Сохранить» в канвасе.
          </p>
        )}
      </div>
    </aside>
  )
}
