import { useState, useRef } from 'react'
import NodeContentEditor from '../canvas/NodeContentEditor.jsx'
import NodeTypeSelect from '../canvas/NodeTypeSelect.jsx'
import { applyTypeChange } from '../canvas/nodeDefaults.js'
import { TYPE_COLOR } from '../canvas/nodeTypes.js'
import { makeNode, NODE_SLOT, renumber } from '../canvas/nodeGraph.js'
import { relinkPrimaryChain } from './nodeGraphPrimary.js'

// Линейный список сообщений урока сверху вниз — альтернатива canvas-редактору
// для быстрого набора большой цепочки. Порядок строк = seq (тот же, что
// показывает canvas), а не отдельное поле: перетаскивание строки просто
// переставляет «основной» триггер (см. nodeGraphPrimary.js), ветки
// (верно/неверно) остаются на месте — их меняют только дропдауны внутри
// NodeContentEditor.
export default function ProductionList({ nodes, onNodesChange, lessonFiles = [], onPickLessonFile, moduleLessons = [] }) {
  const sorted = nodes.slice().sort((a, b) => a.seq - b.seq)
  const [dragId, setDragId] = useState(null)
  const listRef = useRef(null)

  // Фокус в текстовое поле только что созданной строки (Ctrl+Enter / «+») —
  // не через эффект: узел появляется в DOM уже после этого коммита, поэтому
  // ждём следующий кадр прямо из обработчика клика/клавиши.
  function focusRowSoon(nodeId) {
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-node-id="${nodeId}"]`)
      row?.querySelector('textarea, input[type="text"], input:not([type])')?.focus()
    })
  }

  function updateNode(id, patch) {
    onNodesChange(nodes.map(n => (n.id === id ? { ...n, ...patch } : n)))
  }

  function insertAt(index) {
    const maxX = nodes.reduce((m, n) => Math.max(m, n.x ?? 0), 0)
    const node = makeNode(0, maxX + NODE_SLOT, 0)
    const ordered = sorted.slice()
    ordered.splice(index, 0, node)
    onNodesChange(relinkPrimaryChain(ordered))
    focusRowSoon(node.id)
  }

  function duplicateNode(id) {
    const node = nodes.find(n => n.id === id)
    if (!node) return
    const copy = {
      ...node,
      id: crypto.randomUUID(),
      typeData: structuredClone(node.typeData ?? {}),
      triggers: (node.triggers ?? []).map(t => ({ ...t, id: crypto.randomUUID() })),
    }
    const idx = sorted.findIndex(n => n.id === id)
    const ordered = sorted.slice()
    ordered.splice(idx + 1, 0, copy)
    onNodesChange(relinkPrimaryChain(ordered))
  }

  function deleteNode(id) {
    if (!window.confirm('Удалить ноду?')) return
    const filtered = nodes
      .filter(n => n.id !== id)
      .map(n => ({ ...n, triggers: (n.triggers ?? []).map(t => (t.then === id ? { ...t, then: null } : t)) }))
    onNodesChange(renumber(filtered))
  }

  function reorder(fromId, toId) {
    if (!fromId || fromId === toId) return
    const ordered = sorted.slice()
    const fromIdx = ordered.findIndex(n => n.id === fromId)
    const toIdx   = ordered.findIndex(n => n.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = ordered.splice(fromIdx, 1)
    ordered.splice(toIdx, 0, moved)
    onNodesChange(relinkPrimaryChain(ordered))
  }

  return (
    <div className="productionList" ref={listRef}>
      <button className="productionInsertBtn" onClick={() => insertAt(0)}>+ Добавить в начало</button>

      {sorted.map((node, i) => (
        <div
          key={node.id}
          data-node-id={node.id}
          className={'productionRow' + (dragId === node.id ? ' productionRowDragging' : '')}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); reorder(dragId, node.id); setDragId(null) }}
        >
          <div className="productionRowBar" style={{ background: TYPE_COLOR[node.type] }} />
          <div className="productionRowHead">
            <span
              className="productionRowHandle"
              title="Перетащить для смены порядка"
              draggable
              onDragStart={() => setDragId(node.id)}
              onDragEnd={() => setDragId(null)}
            >⠿</span>
            <span className="productionRowSeq">#{node.seq}</span>
            <NodeTypeSelect value={node.type} onChange={v => updateNode(node.id, applyTypeChange(node, v))} compact />
            <button className="productionRowBtn" title="Дублировать" onClick={() => duplicateNode(node.id)}>⧉</button>
            <button className="productionRowBtn productionRowBtnDel" title="Удалить" onClick={() => deleteNode(node.id)}>×</button>
          </div>
          <div
            className="productionRowContent"
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                insertAt(i + 1)
              }
            }}
          >
            <NodeContentEditor
              node={node}
              onUpdate={patch => updateNode(node.id, patch)}
              allNodes={nodes}
              lessonFiles={lessonFiles}
              onPickLessonFile={onPickLessonFile}
              moduleLessons={moduleLessons}
              showTypeSelect={false}
            />
          </div>
          <button className="productionInsertBtn" onClick={() => insertAt(i + 1)}>+ Добавить ноду ниже (Ctrl+Enter)</button>
        </div>
      ))}

      {sorted.length === 0 && (
        <button className="productionInsertBtn productionInsertBtnEmpty" onClick={() => insertAt(0)}>
          + Добавить первую ноду
        </button>
      )}
    </div>
  )
}
