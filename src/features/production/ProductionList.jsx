import { Fragment, useState, useRef } from 'react'
import NodeContentEditor from '../canvas/NodeContentEditor.jsx'
import NodeTypeSelect from '../canvas/NodeTypeSelect.jsx'
import BranchPreview from './BranchPreview.jsx'
import { applyTypeChange } from '../canvas/nodeDefaults.js'
import { TYPE_COLOR } from '../canvas/nodeTypes.js'
import { makeNode, NODE_SLOT, renumber } from '../canvas/nodeGraph.js'
import { relinkPrimaryChain, getBranchTarget } from './nodeGraphPrimary.js'

// Линейный список сообщений урока сверху вниз — альтернатива canvas-редактору
// для быстрого набора большой цепочки. Порядок строк = seq (тот же, что
// показывает canvas), а не отдельное поле: перетаскивание строки просто
// переставляет «основной» триггер (см. nodeGraphPrimary.js), ветки
// (верно/неверно) остаются на месте — их меняют только дропдауны внутри
// NodeContentEditor.
export default function ProductionList({ nodes, onNodesChange, lessonFiles = [], onPickLessonFile, moduleLessons = [] }) {
  const sorted = nodes.slice().sort((a, b) => a.seq - b.seq)
  const [dragId, setDragId] = useState(null)
  // Куда встанет нода при отпускании: { id: <nodeId>|'END', position: 'before'|'after' }
  const [dropTarget, setDropTarget] = useState(null)
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

  // Прыжок к ноде-цели ветки: она уже есть где-то в этом же списке (по seq),
  // отдельно её не редактируем — просто подсвечиваем и скроллим к ней
  function jumpToNode(id) {
    const row = listRef.current?.querySelector(`[data-node-id="${id}"]`)
    if (!row) return
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    row.classList.add('productionRowFlash')
    setTimeout(() => row.classList.remove('productionRowFlash'), 900)
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

  // Наведение во время перетаскивания: верхняя половина строки — «вставить
  // перед ней», нижняя — «после» (см. handleDrop). Пересчитывается на каждый
  // dragover, поэтому линия-индикатор всегда точно под курсором.
  function handleDragOver(e, node) {
    e.preventDefault()
    if (!dragId || dragId === node.id) return
    const rect = e.currentTarget.getBoundingClientRect()
    const position = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
    setDropTarget(prev => (prev?.id === node.id && prev.position === position ? prev : { id: node.id, position }))
  }

  function handleDrop() {
    if (dragId && dropTarget) {
      const ordered = sorted.slice()
      const fromIdx = ordered.findIndex(n => n.id === dragId)
      if (fromIdx >= 0) {
        const [moved] = ordered.splice(fromIdx, 1)
        let toIdx = dropTarget.id === 'END' ? ordered.length : ordered.findIndex(n => n.id === dropTarget.id)
        if (dropTarget.id !== 'END' && dropTarget.position === 'after') toIdx += 1
        ordered.splice(Math.max(0, toIdx), 0, moved)
        onNodesChange(relinkPrimaryChain(ordered))
      }
    }
    setDragId(null)
    setDropTarget(null)
  }

  return (
    <div className="productionList" ref={listRef}>
      <button className="productionInsertBtn" onClick={() => insertAt(0)}>+ Добавить в начало</button>

      {sorted.map((node, i) => {
        const branch = getBranchTarget(node, nodes)
        return (
          <Fragment key={node.id}>
            <div className={branch ? 'productionRowGrid productionRowGridBranch' : 'productionRowGrid'}>
              <div
                data-node-id={node.id}
                className={'productionRow' + (dragId === node.id ? ' productionRowDragging' : '')}
                onDragOver={e => handleDragOver(e, node)}
                onDrop={e => { e.preventDefault(); handleDrop() }}
              >
                {dropTarget?.id === node.id && dropTarget.position === 'before' && <div className="productionDropLine" />}
                <div className="productionRowBar" style={{ background: TYPE_COLOR[node.type] }} />
                <div className="productionRowHead">
                  <span
                    className="productionRowHandle"
                    title="Перетащить для смены порядка"
                    draggable
                    onDragStart={() => setDragId(node.id)}
                    onDragEnd={() => { setDragId(null); setDropTarget(null) }}
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
                {dropTarget?.id === node.id && dropTarget.position === 'after' && <div className="productionDropLine" />}
              </div>
              {branch && (
                <BranchPreview label={branch.label} node={branch.target} onJump={() => jumpToNode(branch.target.id)} />
              )}
            </div>
            <button className="productionInsertBtn" onClick={() => insertAt(i + 1)}>+ Добавить ноду ниже (Ctrl+Enter)</button>
          </Fragment>
        )
      })}

      {sorted.length > 0 && (
        <div
          className="productionListEndZone"
          onDragOver={e => { e.preventDefault(); if (dragId) setDropTarget({ id: 'END', position: 'after' }) }}
          onDrop={e => { e.preventDefault(); handleDrop() }}
        >
          {dropTarget?.id === 'END' && <div className="productionDropLine" />}
        </div>
      )}

      {sorted.length === 0 && (
        <button className="productionInsertBtn productionInsertBtnEmpty" onClick={() => insertAt(0)}>
          + Добавить первую ноду
        </button>
      )}
    </div>
  )
}
