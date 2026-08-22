import { useState, useEffect } from 'react'
import { useRegistrationSkip } from './useRegistrationSkip.js'

// Нижние панели ответа: какая нода сейчас в каждой из них, высота открытой
// панели (на неё приподнимаются сообщения) и что скипнуть залогиненному.
// Вынесено из LessonPlayer.jsx — он у потолка размера файла.
const KIND_TYPE = {
  wc: 'word_choice', pa: 'phrase_assembly', pc: 'photo_choice',
  reg: 'registration', table: 'table', pin: 'pin_message',
}

const PANEL_KINDS = ['wc', 'pa', 'pc', 'reg', 'table']

// Нода, которая живёт только в ленте и панель снизу не открывает
function isChatOnly(node) {
  return node.type === 'table' && (node.typeData?.table?.mode ?? 'dictator') === 'demo'
}

// Панель живёт, пока её нода — ПОСЛЕДНЯЯ в ленте. Обычный ответ прячет панель
// её собственной анимацией, но шаг «вперёд» админа отвечает в обход панели
// (stepAnswer.js) — она так и висела бы поверх следующих сообщений. Теперь
// панель уходит вместе со своей нодой, как только показано новое сообщение.
// Обычный поток от этого не меняется: между ответом и следующей нодой
// проходит ~3.4 с, а панель уезжает за 1.6 с — её уже не видно.
//
// Закреплённое сообщение (pin) — не панель: оно висит независимо от того,
// что идёт в ленте сейчас, поэтому берётся последним своего типа.
//
// Таблица в режиме «Показ» тоже панели не открывает: она приходит в чат
// обычным сообщением (TableDemoModule) и ответа не ждёт.
export function pickPanelNodes(visibleNodes) {
  const last = visibleNodes[visibleNodes.length - 1] ?? null
  const lastPin = [...visibleNodes].reverse().find(n => n.type === 'pin_message') ?? null
  return Object.fromEntries(
    Object.entries(KIND_TYPE).map(([kind, type]) => [
      kind,
      kind === 'pin' ? lastPin
        : (last?.type === type && !isChatOnly(last) ? last : null),
    ]),
  )
}

export function usePlayerPanelNodes(visibleNodes, { onNodeDone, panelShown }) {
  const [heights, setHeights] = useState({ wc: 0, pa: 0, pc: 0, reg: 0, table: 0 })

  const node = pickPanelNodes(visibleNodes)

  // Залогинен → рег-нода скипается (сразу reg_submit), панель не рендерится
  const showRegPanel = useRegistrationSkip(node.reg, onNodeDone)

  // Таймер ответа стартует с появления панели (SKILL_ANALYSIS.md §4)
  useEffect(() => {
    [node.wc, node.pa, node.pc].forEach(n => { if (n) panelShown(n.id) })
  }, [node.wc?.id, node.pa?.id, node.pc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const setHeight = kind => h => setHeights(prev => (prev[kind] === h ? prev : { ...prev, [kind]: h }))

  // Сообщения приподнимает только ТА панель, что сейчас на экране: панель,
  // ушедшая вместе со своей нодой, не должна оставлять за собой отступ
  const activeKind = PANEL_KINDS.find(k => node[k])

  return {
    node,
    showRegPanel,
    setHeight,
    offset: activeKind ? heights[activeKind] : 0,
    // Последняя активная панельная нода — у неё свой карандаш правки
    editNode: node.table ?? node.reg ?? node.pc ?? node.pa ?? node.wc,
  }
}
