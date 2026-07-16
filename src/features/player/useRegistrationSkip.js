import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../shared/lib/useAuth.js'

// Авто-пропуск ноды «Регистрация» для залогиненного пользователя: панель не
// показывается, сразу срабатывает переход по триггеру reg_submit (если триггер
// не привязан — рег-нода последняя — useGraphPlayer штатно завершит урок).
//
// Решение «скипать или показать» фиксируется по ноде ОДИН раз в момент её
// появления (когда loading у useAuth закончился) и дальше не пересматривается:
// гость, зарегистрировавшийся прямо в панели, не увидит её резкого
// исчезновения из-за реактивной смены user — панель закроется сама через свой
// setTimeout, а повторный onNodeDone безопасен (дедуп firedRef в useGraphPlayer).
//
// Возвращает showRegPanel: рендерить ли RegistrationPanel для текущей рег-ноды.
// Пока loading или решение не принято — false (панель не мигает).
export function useRegistrationSkip(regNode, onNodeDone) {
  const { user, loading } = useAuth()
  const [decisions, setDecisions] = useState({}) // nodeId -> 'skip' | 'show'
  const decidedRef = useRef(new Set())

  const regNodeId = regNode?.id ?? null
  useEffect(() => {
    if (!regNodeId || loading) return
    if (decidedRef.current.has(regNodeId)) return
    decidedRef.current.add(regNodeId)
    const skip = !!user
    setDecisions(prev => ({ ...prev, [regNodeId]: skip ? 'skip' : 'show' }))
    if (skip) onNodeDone(regNodeId, 'reg_submit')
    // user/onNodeDone намеренно не в deps: решение по ноде принимается один раз
  }, [regNodeId, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  return !!regNodeId && decisions[regNodeId] === 'show'
}
