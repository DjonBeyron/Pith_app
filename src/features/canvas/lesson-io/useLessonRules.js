import { useState, useEffect, useCallback } from 'react'
import {
  listLessonRules, createLessonRule, updateLessonRule,
  setLessonRuleActive, setLessonRuleCategory, swapLessonRuleOrder, deleteLessonRule,
} from '../../../shared/api/lessonRulesApi.js'

// Список правил формирования урока с сервера + операции над ним. Источник
// правды — Supabase (см. lessonRulesApi.js), локально не кэшируем: правило,
// добавленное на одной машине, должно попасть в экспорт урока сразу же,
// с любой другой.
//
// rules — общий список; principles/checklist — тот же список, разложенный
// по category (principle — правило «здесь и сейчас», checklist — пункт
// чек-листа «перед сдачей» целиком по уроку). moveUp/moveDown двигают
// строку СРЕДИ ЕЁ ЖЕ категории — порядок принципов и чек-листа не связаны.
export function useLessonRules() {
  const [rules, setRules] = useState([])
  const [busy,  setBusy]  = useState(true)
  const [error, setError] = useState(null)

  const run = useCallback(async (fn) => {
    setBusy(true)
    try {
      await fn()
      setRules(await listLessonRules())
      setError(null)
    } catch (e) {
      setError(e?.message ?? 'Не удалось связаться с сервером')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await listLessonRules()
        if (alive) { setRules(list); setError(null) }
      } catch (e) {
        if (alive) setError(e?.message ?? 'Не удалось загрузить правила')
      } finally {
        if (alive) setBusy(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const add = useCallback((text, category = 'principle') => run(() => {
    const inCat = rules.filter(r => r.category === category)
    const nextOrder = inCat.length ? Math.max(...inCat.map(r => r.order)) + 10 : 10
    return createLessonRule(text, nextOrder, category)
  }), [run, rules])

  const edit     = useCallback((id, text)     => run(() => updateLessonRule(id, text)),         [run])
  const toggle   = useCallback((id, active)   => run(() => setLessonRuleActive(id, active)),     [run])
  const setCategory = useCallback((id, category) => run(() => setLessonRuleCategory(id, category)), [run])
  const remove   = useCallback(id             => run(() => deleteLessonRule(id)),                [run])

  const moveUp = useCallback((id) => run(() => {
    const rule = rules.find(r => r.id === id)
    if (!rule) return Promise.resolve()
    const inCat = rules.filter(r => r.category === rule.category)
    const i = inCat.findIndex(r => r.id === id)
    if (i <= 0) return Promise.resolve()
    return swapLessonRuleOrder(inCat[i], inCat[i - 1])
  }), [run, rules])

  const moveDown = useCallback((id) => run(() => {
    const rule = rules.find(r => r.id === id)
    if (!rule) return Promise.resolve()
    const inCat = rules.filter(r => r.category === rule.category)
    const i = inCat.findIndex(r => r.id === id)
    if (i === -1 || i >= inCat.length - 1) return Promise.resolve()
    return swapLessonRuleOrder(inCat[i], inCat[i + 1])
  }), [run, rules])

  const principles = rules.filter(r => r.category === 'principle')
  const checklist  = rules.filter(r => r.category === 'checklist')

  return { rules, principles, checklist, busy, error, add, edit, toggle, setCategory, remove, moveUp, moveDown }
}
