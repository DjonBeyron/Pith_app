import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { isAnimV2 } from '../../scene/v2/animFlags.js'
import { sceneNodeBreakdown } from '../../scene/v2/sceneBudget.js'
import { parseSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import * as M from './builderModel.js'
import * as H from './draftHistory.js'
import * as D from './history/draftState.js'
import { buildDraftActions } from './history/draftActions.js'
import { sceneLoadLabel } from './history/historyLabels.js'
import { saveBackup, loadBackup, clearBackup } from './draftBackup.js'

// Состояние сборщика сцен: черновик (нормализованная сцена v2), привязка к строке
// библиотеки (savedId/savedStatus), снимок последнего сохранения (dirty), линтер и
// бюджет (memo), резервная копия в localStorage (с задержкой 400 мс после правки).
// Вся логика правок — builderModel.js / timelineOps.js; здесь только склейка с React.

const BACKUP_DELAY = 400

// initialScene — управляемый режим (сцена для ноды урока, NodeScenePicker): старт с неё,
// без восстановления и без записи резервной копии (backup=false) — черновик админа не трогаем.
// initialRow — строка библиотеки, из которой взята initialScene (сцена ленты): «Сохранить»
// тогда обновляет её, а не создаёт новую
export function useBuilderDraft({ initialScene = null, initialRow = null, backup = true } = {}) {
  const [restored] = useState(() => (initialScene || !backup ? null : loadBackup()))
  // Одно состояние: сцена, привязка к библиотеке (saved) и история правок (hist) меняются атомарно
  const [st, setSt] = useState(() => {
    const scene = initialScene ? M.fromScene(initialScene) : (restored?.scene ?? M.newDraft())
    const saved = initialScene && initialRow?.id
      ? { id: initialRow.id, status: initialRow.status ?? 'draft', snapshot: M.fromScene(initialScene) }
      : { id: restored?.savedId ?? null, status: 'draft', snapshot: null }
    return D.initialState(scene, saved)
  })
  const { scene, saved, hist } = st
  const [restoredAt, setRestoredAt] = useState(restored?.at ?? null)
  const timer = useRef(null)
  const latest = useRef(null)

  const lint = useMemo(() => lintScene(scene, { animV2: isAnimV2() }), [scene]) // при включённом «живом Пите v2» — предупреждение «нет огибающей»
  const budget = useMemo(() => sceneNodeBreakdown(scene), [scene])
  const errors = lint.filter(x => x.level === 'error')
  const dirty = saved.snapshot ? !M.sameScene(saved.snapshot, scene) : true

  // Резервная копия — после паузы в правках (и после отмены/повтора — они меняют scene); при размонтировании
  // (закрыли окно) — сразу, из latest (ref обновляется в эффекте, не в рендере)
  useEffect(() => {
    latest.current = { scene, savedId: saved.id }
    if (!backup) return undefined
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveBackup(latest.current), BACKUP_DELAY)
    return () => clearTimeout(timer.current)
  }, [scene, saved.id, backup])
  useEffect(() => () => { if (backup && latest.current) saveBackup(latest.current) }, [backup])

  // Правка сцены отдельным шагом истории / замена сцены целиком (history/draftState.js — чистые переходы)
  const edit = useCallback((label, fn, key = null) => {
    const at = Date.now()
    setSt(s => D.editState(s, label, fn, key, at))
  }, [])
  const swap = useCallback((label, next, nextSaved = null) => {
    const at = Date.now()
    setSt(s => D.swapState(s, label, next, nextSaved, at))
  }, [])

  const actions = useMemo(() => ({
    ...buildDraftActions(edit),
    // Загрузить сцену целиком (из JSON, нейросети, библиотеки): row — строка библиотеки, если есть; label — подпись шага отмены
    load: (next, row = null, label = null) => {
      const s = M.fromScene(next)
      swap(label ?? sceneLoadLabel(s.title), s, row ? { id: row.id, status: row.status, snapshot: s } : { id: null, status: 'draft', snapshot: null })
      setRestoredAt(null)
    },
    // Новая сцена — отвязана от библиотеки
    reset: location => { swap('новая сцена', M.newDraft(location), { id: null, status: 'draft', snapshot: null }); setRestoredAt(null); if (backup) clearBackup() },
    // После успешного сохранения в библиотеку
    markSaved: row => setSt(s => ({ ...s, saved: { id: row.id, status: row.status, snapshot: M.fromScene(row.scene) } })),
    // «Сохранить как…»: копия сцены (новое название и id) становится черновиком, привязанным к новой строке библиотеки
    adoptSaved: (next, row) => { const s = M.fromScene(next); swap('сохранить как…', s, { id: row.id, status: row.status, snapshot: M.fromScene(row.scene ?? s) }) },
    detach: () => setSt(s => ({ ...s, saved: { id: null, status: 'draft', snapshot: null } })),
    restoreSaved: prev => setSt(s => ({ ...s, saved: prev })), // отмена удаления сцены из библиотеки
    dismissRestored: () => setRestoredAt(null),
  }), [edit, swap, backup])

  // Текст JSON → { ok, errors }; при успехе грузится в черновик (связь с библиотекой сохраняется)
  const applyJson = useCallback(text => {
    const r = parseSceneV2(text)
    if (r.scene) swap('применение JSON', r.scene)
    return { ok: !!r.scene, errors: r.errors }
  }, [swap])

  // Отмена/повтор (draftHistory.js); подпись шага для строки статуса берёт вызывающий из history.undoLabel/redoLabel
  const stepBy = useCallback(op => setSt(s => D.stepState(s, op)), [])
  const history = useMemo(() => ({
    canUndo: H.canUndo(hist), canRedo: H.canRedo(hist), undoLabel: H.undoLabel(hist), redoLabel: H.redoLabel(hist),
    undo: () => stepBy(H.undo), redo: () => stepBy(H.redo),
  }), [hist, stepBy])

  return { scene, saved, dirty, lint, errors, budget, restoredAt, actions, applyJson, history, exportJson: () => M.exportJson(scene) }
}
