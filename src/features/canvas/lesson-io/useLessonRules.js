import { useState, useEffect, useCallback } from 'react'
import { SEED_RULES } from './lessonRulesSeed.js'
import {
  listLessonRules, createLessonRule, createLessonRuleFull, updateLessonRule, patchLessonRule,
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
  const patch    = useCallback((id, fields)   => run(() => patchLessonRule(id, fields)),         [run])
  // Переключатель «вкл/выкл» сразу меняется на экране (без ожидания сервера и без блокировки всего окна); при ошибке сервера возвращается назад
  const toggle = useCallback(async (id, active) => {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, active } : r)))
    try {
      await setLessonRuleActive(id, active)
      setError(null)
    } catch (e) {
      setRules(prev => prev.map(r => (r.id === id ? { ...r, active: !active } : r)))
      setError(`Не удалось ${active ? 'включить' : 'выключить'} правило: ${e?.message ?? 'ошибка сервера'}`)
    }
  }, [])
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

  // Таблица lesson_rules пуста (правила жили только в коде) — одним действием кладём в неё стандартные, дальше правятся в окне
  const seedDefaults = useCallback(() => run(async () => {
    const n = { principle: 0, checklist: 0 }
    for (const r of SEED_RULES) await createLessonRuleFull(r, (++n[r.category]) * 10)
  }), [run])

  // Доводит базу до стандартного набора: недостающие правила (например, новая группа «Последовательности») создаёт, у существующих
  // (по совпадению текста) заполняет пустые название/группу/проверку и примеры. Уже заданное автором не перезаписывает
  const enrichFromSeed = useCallback(() => run(async () => {
    const maxOrder = { principle: Math.max(0, ...rules.filter(r => r.category === 'principle').map(r => r.order)), checklist: Math.max(0, ...rules.filter(r => r.category === 'checklist').map(r => r.order)) }
    for (const seed of SEED_RULES) {
      const r = rules.find(x => x.text === seed.text)
      if (!r) { await createLessonRuleFull(seed, (maxOrder[seed.category] += 10)); continue }
      const fill = {}
      if (!r.title) Object.assign(fill, { title: seed.title, group: seed.group, checker: seed.checker, severity: seed.severity })
      if (!r.bad && seed.bad) fill.bad = seed.bad
      if (!r.good && seed.good) fill.good = seed.good
      if (Object.keys(fill).length) await patchLessonRule(r.id, fill)
    }
  }), [run, rules])

  const principles = rules.filter(r => r.category === 'principle')
  const checklist  = rules.filter(r => r.category === 'checklist')

  return { rules, principles, checklist, busy, error, add, seedDefaults, enrichFromSeed, edit, patch, toggle, setCategory, remove, moveUp, moveDown }
}
