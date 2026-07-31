import { Fragment, useState, useRef } from 'react'
import ProductionRow from './ProductionRow.jsx'
import InsertNodeButton from './InsertNodeButton.jsx'
import { applyTypeChange, setLastNodeType } from '../canvas/nodeDefaults.js'
import { makeNode, NODE_SLOT, renumber } from '../canvas/nodeGraph.js'
import { relinkPrimaryChain, buildRenderPlan, insertNodeAfter, insertNodeAtStart } from './nodeGraphPrimary.js'

// Линейный список сообщений урока сверху вниз — альтернатива canvas-редактору
// для быстрого набора большой цепочки. Порядок строк = seq (тот же, что
// показывает canvas). У ноды с развилкой (например word_choice) следующая по
// основному пути и цель ветки показываются ПАРОЙ, делят экран пополам
// (buildRenderPlan) — у каждой колонки своя кнопка «Добавить ноду ниже»,
// чтобы новая нода цеплялась именно к «верно» или именно к «неверно», а не
// к случайному соседу по общему списку (см. insertNodeAfter). Кнопки «+»
// открывают компактное меню выбора типа (InsertNodeButton) вместо того,
// чтобы молча создавать ноду прошлого выбранного типа.
export default function ProductionList({ nodes, onNodesChange, lessonFiles = [], onPickLessonFile, moduleLessons = [] }) {
  const sorted = nodes.slice().sort((a, b) => a.seq - b.seq)
  const plan = buildRenderPlan(sorted, nodes)
  const [dragId, setDragId] = useState(null)
  // Куда встанет нода при отпускании: { id: <nodeId>|'END', position: 'before'|'after' }
  const [dropTarget, setDropTarget] = useState(null)
  const listRef = useRef(null)

  // Фокус в текстовое поле только что созданной строки — не через эффект:
  // узел появляется в DOM уже после этого коммита, поэтому ждём следующий
  // кадр прямо из обработчика клика/клавиши.
  function focusRowSoon(nodeId) {
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-node-id="${nodeId}"]`)
      row?.querySelector('textarea, input[type="text"], input:not([type])')?.focus()
    })
  }

  // type не задан — берётся последний выбранный (для Ctrl+Enter и старого
  // поведения); задан явно — из меню InsertNodeButton
  function createNode(type) {
    if (type) setLastNodeType(type)
    const maxX = nodes.reduce((m, n) => Math.max(m, n.x ?? 0), 0)
    return makeNode(0, maxX + NODE_SLOT, 0)
  }

  function updateNode(id, patch) {
    onNodesChange(nodes.map(n => (n.id === id ? { ...n, ...patch } : n)))
  }

  // Вставляет новую ноду СРАЗУ ПОСЛЕ afterId — патчит только основной триггер
  // этой конкретной ноды (insertNodeAfter), не весь список. Это и есть выбор
  // «к какой ветке цепляем»: кнопка под «Верно» вызывает insertAfterNode(left.id),
  // кнопка под «Неверно» — insertAfterNode(right.id).
  function insertAfterNode(afterId, type) {
    const node = createNode(type)
    onNodesChange(insertNodeAfter(nodes, afterId, node))
    focusRowSoon(node.id)
  }

  function insertAtStart(type) {
    const node = createNode(type)
    onNodesChange(insertNodeAtStart(nodes, node))
    focusRowSoon(node.id)
  }

  function insertFirstNode(type) {
    if (type) setLastNodeType(type)
    const node = makeNode(1, 0, 0)
    onNodesChange([node])
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
    onNodesChange(insertNodeAfter(nodes, id, copy))
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

  // Перетаскивание меняет порядок В ПРЕДЕЛАХ плоского списка по seq — при
  // сложных развилках (см. insertNodeAfter выше) это не так безопасно, как
  // точечная вставка, но это отдельная, более крупная задача
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

  // Общие пропсы ProductionRow для конкретной ноды — единая точка, чтобы не
  // повторять один и тот же список из 12 полей в single- и pair-ветках рендера.
  function rowProps(node) {
    return {
      node,
      isDragging: dragId === node.id,
      dropLineBefore: dropTarget?.id === node.id && dropTarget.position === 'before',
      dropLineAfter: dropTarget?.id === node.id && dropTarget.position === 'after',
      onDragOver: e => handleDragOver(e, node),
      onDrop: e => { e.preventDefault(); handleDrop() },
      onHandleDragStart: () => setDragId(node.id),
      onHandleDragEnd: () => { setDragId(null); setDropTarget(null) },
      onUpdate: patch => updateNode(node.id, patch),
      onTypeChange: v => updateNode(node.id, applyTypeChange(node, v)),
      onDuplicate: () => duplicateNode(node.id),
      onDelete: () => deleteNode(node.id),
      onInsertBelow: () => insertAfterNode(node.id),
      allNodes: nodes,
      lessonFiles,
      onPickLessonFile,
      moduleLessons,
    }
  }

  return (
    <div className="productionList" ref={listRef}>
      <InsertNodeButton label="+ Добавить в начало" onInsert={type => insertAtStart(type)} />

      {plan.map(item => item.type === 'single' ? (
        <Fragment key={item.node.id}>
          <div className="productionSingleWrap">
            <ProductionRow {...rowProps(item.node)} />
          </div>
          <InsertNodeButton
            label="+ Добавить ноду ниже (Ctrl+Enter)"
            onInsert={type => insertAfterNode(item.node.id, type)}
          />
        </Fragment>
      ) : (
        <Fragment key={`${item.left.id}-${item.right.id}`}>
          <div className="productionPairGrid">
            <div className="productionPairCol">
              <span className="productionPairLabel productionPairLabelOk">{item.leftLabel}</span>
              <ProductionRow {...rowProps(item.left)} />
              <InsertNodeButton
                label="+ Добавить ноду ниже (Ctrl+Enter)"
                onInsert={type => insertAfterNode(item.left.id, type)}
              />
            </div>
            <div className="productionPairCol">
              <span className="productionPairLabel productionPairLabelErr">{item.rightLabel}</span>
              <ProductionRow {...rowProps(item.right)} />
              <InsertNodeButton
                label="+ Добавить ноду ниже (Ctrl+Enter)"
                onInsert={type => insertAfterNode(item.right.id, type)}
              />
            </div>
          </div>
        </Fragment>
      ))}

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
        <InsertNodeButton
          label="+ Добавить первую ноду"
          className="productionInsertBtn productionInsertBtnEmpty"
          onInsert={type => insertFirstNode(type)}
        />
      )}
    </div>
  )
}
