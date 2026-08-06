import { Fragment, useState, useRef } from 'react'
import ProductionRow from './ProductionRow.jsx'
import ProductionFanRow from './ProductionFanRow.jsx'
import InsertNodeButton from './InsertNodeButton.jsx'
import { applyTypeChange, setLastNodeType } from '../canvas/nodeDefaults.js'
import { makeNode, NODE_SLOT, renumber } from '../canvas/nodeGraph.js'
import { getVariantList } from '../canvas/nodeVariants.js'
import { dbg } from '../../shared/lib/debug.js'
import {
  relinkPrimaryChain, buildRenderPlan, insertNodeAfter, insertNodeAfterBoth, insertNodeAtStart,
  getBranchTriggerIndex,
} from './nodeGraphPrimary.js'

// Шаг по Y между параллельными ветками в canvas — чтобы «верно»/«неверно»/
// особые переходы, созданные из продакшена, ложились разными строками
// холста, а не одной горизонтальной линией (там было не видно, какая нода
// какой ветке принадлежит)
const NODE_SLOT_Y = 260

// branch: undefined — основной; 'branch' — ветка «неверно»; 'variant:<id>' —
// особый переход конкретного варианта ответа (nodeVariants.js)
function resolveTriggerIdx(afterNode, branch) {
  if (branch === 'branch') return getBranchTriggerIndex(afterNode)
  if (branch?.startsWith('variant:')) {
    const variantId = branch.slice('variant:'.length)
    return afterNode.triggers.findIndex(t => t.if === variantId)
  }
  return undefined
}

// Номер «дорожки» (0,1,2...) ветки для Y-смещения в canvas: верно — 0,
// неверно — 1, особые переходы вариантов — по порядку после них
function branchTrackIndex(node, branch) {
  if (!branch || branch === 'primary') return 0
  if (branch === 'branch') return 1
  const variantId = branch.slice('variant:'.length)
  const variantList = getVariantList(node.type, node.typeData?.[node.type] ?? {})
  const idx = variantList.findIndex(v => v.id === variantId)
  return idx >= 0 ? idx + 2 : 2
}

// Линейный список сообщений урока сверху вниз — альтернатива canvas-редактору
// для быстрого набора большой цепочки. Порядок строк = seq (тот же, что
// показывает canvas). У ноды с развилкой (например word_choice) следующая по
// основному пути и цель ветки показываются ПАРОЙ, делят экран пополам
// (buildRenderPlan) — у каждой колонки своя кнопка «Добавить ноду ниже»,
// чтобы новая нода цеплялась именно к «верно» или именно к «неверно», а не
// к случайному соседу по общему списку (см. insertNodeAfter). Кнопки «+»
// открывают компактное меню выбора типа (InsertNodeButton) вместо того,
// чтобы молча создавать ноду прошлого выбранного типа.
export default function ProductionList({
  nodes, onNodesChange, lessonFiles = [], onPickLessonFile, moduleLessons = [], scrollRef,
}) {
  const sorted = nodes.slice().sort((a, b) => a.seq - b.seq)
  const plan = buildRenderPlan(sorted, nodes)
  const [dragId, setDragId] = useState(null)
  // Куда встанет нода при отпускании: { id: <nodeId>|'END', position: 'before'|'after' }
  const [dropTarget, setDropTarget] = useState(null)
  // Блок «Если/Тогда» свёрнут по умолчанию у каждой ноды — id тех, что раскрыли
  const [expandedTriggerIds, setExpandedTriggerIds] = useState(() => new Set())
  // Рамка позиционирования/масштаба файла — тоже свёрнута по умолчанию
  const [expandedMediaIds, setExpandedMediaIds] = useState(() => new Set())
  // scrollRef — снаружи (ProductionPage, кнопка «В начало»), если не передан
  // (например изолированный дебаг-рендер) — используем свой собственный
  const internalRef = useRef(null)
  const listRef = scrollRef ?? internalRef

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
  // поведения); задан явно — из меню InsertNodeButton. y — своя строка в
  // canvas (по умолчанию 0, см. insertAfterNode/insertBetweenBoth)
  function createNode(type, y = 0) {
    if (type) setLastNodeType(type)
    const maxX = nodes.reduce((m, n) => Math.max(m, n.x ?? 0), 0)
    return makeNode(0, maxX + NODE_SLOT, y)
  }

  function updateNode(id, patch) {
    onNodesChange(nodes.map(n => (n.id === id ? { ...n, ...patch } : n)))
  }

  // Вставляет новую ноду СРАЗУ ПОСЛЕ afterId — патчит только один триггер
  // этой конкретной ноды (insertNodeAfter), не весь список. Обычно основной
  // (для пар-колонок это однозначно «верно» или «неверно» — кнопка под
  // «Верно» вызывает insertAfterNode(left.id), под «Неверно» — insertAfterNode
  // (right.id)). У самой ветвящейся ноды это неоднозначно — branch='branch'
  // приходит из второго шага меню (branchChoices, см. plan.branchChoices) —
  // именно в этой точке ветка получает СВОЙ Y (branchTrackIndex), дальше
  // кнопки колонок (branch не передан) просто наследуют Y родителя — вся
  // цепочка ветки остаётся в одной строке canvas, а не съезжает в общую
  function insertAfterNode(afterId, type, branch) {
    const afterNode = nodes.find(n => n.id === afterId)
    const y = branch !== undefined
      ? (afterNode?.y ?? 0) + branchTrackIndex(afterNode, branch) * NODE_SLOT_Y
      : (afterNode?.y ?? 0)
    const node = createNode(type, y)
    onNodesChange(insertNodeAfter(nodes, afterId, node, resolveTriggerIdx(afterNode, branch)))
    focusRowSoon(node.id)
  }

  // Точка схождения: новая нода становится продолжением ОБЕИХ веток сразу
  // (кнопка между «Верно» и «Неверно» — независимо от ответа урок продолжает
  // одно и то же сообщение). Y — посередине между строками обеих веток
  function insertBetweenBoth(leftId, rightId, type) {
    const leftY  = nodes.find(n => n.id === leftId)?.y ?? 0
    const rightY = nodes.find(n => n.id === rightId)?.y ?? 0
    const node = createNode(type, (leftY + rightY) / 2)
    onNodesChange(insertNodeAfterBoth(nodes, leftId, rightId, node))
    focusRowSoon(node.id)
  }

  function toggleTriggers(id) {
    setExpandedTriggerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMedia(id) {
    setExpandedMediaIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
        // Без try/catch ошибка внутри relinkPrimaryChain обрывала бы
        // handleDrop до setDragId(null)/setDropTarget(null) — точка вставки
        // застревала бы навсегда, и снаружи это выглядело бы как «ничего не
        // происходит» при каждой следующей попытке перетащить любую ноду
        try {
          onNodesChange(relinkPrimaryChain(ordered))
        } catch (e) {
          dbg('[PRODUCTION ERROR] relinkPrimaryChain failed', e?.message)
        }
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
      triggersExpanded: expandedTriggerIds.has(node.id),
      onToggleTriggers: () => toggleTriggers(node.id),
      mediaExpanded: expandedMediaIds.has(node.id),
      onToggleMedia: () => toggleMedia(node.id),
    }
  }

  return (
    <div className="productionListScroll" ref={listRef}>
      <div className="productionList">
        <InsertNodeButton label="+ Добавить в начало" onInsert={type => insertAtStart(type)} />

        {plan.map(item => item.type === 'single' ? (
          <Fragment key={item.node.id}>
            <div className={'productionSingleWrap' + (expandedTriggerIds.has(item.node.id) ? ' productionSingleWrapWide' : '')}>
              <ProductionRow {...rowProps(item.node)} />
            </div>
            <InsertNodeButton
              label="+ Добавить ноду ниже (Ctrl+Enter)"
              branchChoices={item.branchChoices}
              onInsert={(type, branch) => insertAfterNode(item.node.id, type, branch)}
            />
          </Fragment>
        ) : (
          <ProductionFanRow
            key={item.columns.map(c => c.node.id).join('-')}
            columns={item.columns}
            rowProps={rowProps}
            insertAfterNode={insertAfterNode}
            insertBetweenBoth={insertBetweenBoth}
          />
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
    </div>
  )
}
