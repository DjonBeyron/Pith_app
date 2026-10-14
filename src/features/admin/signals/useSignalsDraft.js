import { useState, useCallback, useEffect } from 'react'
import { useFeedSignals, setFeedSignals, rollbackFeedSignalsTo, refreshFeedSignals } from '../../../shared/lib/ranking/feedSignalsStore.js'
import { loadFeedSignalsHistory } from '../../../shared/api/feedSignalsApi.js'
import {
  createDraft, setWeight, setEnabled, setEngine, setRule, defaultsDraft, isDirty, prepareSave, draftWarnings,
} from './draftModel.js'

// Состояние окна «Сигналы ленты»: активный конфиг (стор), черновик, история версий,
// сохранение/откат и строка статуса. Вся чистая логика — в draftModel.js.
// updatedBy — e-mail админа для штампа версии.
const netText = e => (navigator.onLine === false ? 'Нет сети — изменения не сохранены' : (e?.message || 'Не удалось сохранить'))
const fetchHistory = () => loadFeedSignalsHistory()
  .then(list => ({ list, loading: false, error: '' }))
  .catch(e => ({ list: [], loading: false, error: netText(e) }))
const rightsText = e => (/permission|policy|row-level|не применилось|403|401/i.test(e?.message ?? '') ? 'Нет прав на запись (RLS): сохранять конфиг может только админ' : netText(e))

export function useSignalsDraft(updatedBy) {
  const active = useFeedSignals()
  const [draft, setDraft] = useState(() => createDraft(active))
  const [status, setStatus] = useState(null) // { kind: 'ok' | 'warn' | 'error', text }
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState({ list: [], loading: true, error: '' })

  // Чужое/своё сохранение подменило активный конфиг: чистый черновик следует за ним
  const [seenActive, setSeenActive] = useState(active)
  if (active !== seenActive) {
    setSeenActive(active)
    if (!isDirty(draft, seenActive)) setDraft(createDraft(active))
  }

  const dirty = isDirty(draft, active)
  const warnings = draftWarnings(draft)

  // Состояние истории ставится в колбэке после ответа сети (не синхронно в эффекте)
  const loadHistory = useCallback(() => fetchHistory().then(setHistory), [])
  const reloadHistory = () => { setHistory(h => ({ ...h, loading: true, error: '' })); loadHistory() }

  useEffect(() => {
    refreshFeedSignals()
    let alive = true
    fetchHistory().then(next => { if (alive) setHistory(next) })
    return () => { alive = false }
  }, [])

  const edit = fn => setDraft(d => fn(d))
  const actions = {
    weight: (id, w) => edit(d => setWeight(d, id, w)),
    enable: (id, on) => edit(d => setEnabled(d, id, on)),
    engine: engine => edit(d => setEngine(d, engine)),
    rule: (k, v) => edit(d => setRule(d, k, v)),
    replace: cfg => setDraft(createDraft(cfg)),
    reset: () => { setDraft(createDraft(active)); setStatus({ kind: 'ok', text: 'Черновик сброшен к активной версии' }) },
    defaults: () => { setDraft(defaultsDraft()); setStatus({ kind: 'ok', text: 'Черновик — значения по умолчанию (движок legacy)' }) },
  }

  async function save(note) {
    if (busy) return
    const { config, clamped } = prepareSave(active, draft)
    setBusy(true)
    try {
      const saved = await setFeedSignals(config, { updatedBy, note })
      setDraft(createDraft(saved))
      setStatus(clamped.length
        ? { kind: 'warn', text: `Сохранено с ограничением шага: вес меняется не больше чем на 20 за одно сохранение — ${clamped.map(c => `${c.title} ${c.wanted} → ${c.got}`).join(', ')}. Сохрани ещё раз, чтобы дойти до нужного значения.` }
        : { kind: 'ok', text: `Сохранено как новая версия (${saved.engine})` })
      loadHistory()
    } catch (e) {
      setStatus({ kind: 'error', text: rightsText(e) })
    } finally { setBusy(false) }
  }

  async function rollback(updatedAt) {
    if (busy) return
    setBusy(true)
    try {
      const saved = await rollbackFeedSignalsTo(updatedAt, { updatedBy })
      setDraft(createDraft(saved))
      setStatus({ kind: 'ok', text: 'Откат выполнен: версия из истории стала активной' })
      loadHistory()
    } catch (e) {
      setStatus({ kind: 'error', text: rightsText(e) })
    } finally { setBusy(false) }
  }

  return { active, draft, dirty, warnings, status, setStatus, busy, history, loadHistory: reloadHistory, actions, save, rollback }
}
