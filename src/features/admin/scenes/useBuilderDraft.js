import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { sceneNodeBreakdown } from '../../scene/v2/sceneBudget.js'
import { parseSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import * as M from './builderModel.js'
import * as T from './timelineOps.js'
import * as TK from './taskModel.js'
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
  const [scene, setScene] = useState(() => (initialScene ? M.fromScene(initialScene) : (restored?.scene ?? M.newDraft())))
  const [saved, setSaved] = useState(() => (initialScene && initialRow?.id
    ? { id: initialRow.id, status: initialRow.status ?? 'draft', snapshot: M.fromScene(initialScene) }
    : { id: restored?.savedId ?? null, status: 'draft', snapshot: null }))
  const [restoredAt, setRestoredAt] = useState(restored?.at ?? null)
  const timer = useRef(null)
  const latest = useRef(null)

  const lint = useMemo(() => lintScene(scene), [scene])
  const budget = useMemo(() => sceneNodeBreakdown(scene), [scene])
  const errors = lint.filter(x => x.level === 'error')
  const dirty = saved.snapshot ? !M.sameScene(saved.snapshot, scene) : true

  // Резервная копия — после паузы в правках; при размонтировании (закрыли окно) — сразу,
  // из latest (ref обновляется в эффекте, не в рендере)
  useEffect(() => {
    latest.current = { scene, savedId: saved.id }
    if (!backup) return undefined
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveBackup(latest.current), BACKUP_DELAY)
    return () => clearTimeout(timer.current)
  }, [scene, saved.id, backup])
  useEffect(() => () => { if (backup && latest.current) saveBackup(latest.current) }, [backup])

  const patch = useCallback(fn => setScene(s => fn(s)), [])
  const tl = useCallback(fn => setScene(s => M.setTimeline(s, fn(s.timeline))), [])

  const actions = useMemo(() => ({
    setTitle: v => patch(s => M.setTitle(s, v)),
    setId: v => patch(s => M.setId(s, v)),
    setLocation: v => patch(s => M.setLocation(s, v)),
    setSlot: (slotId, spriteId) => patch(s => M.setSlot(s, slotId, spriteId)),
    clearSlots: () => patch(M.clearSlots),
    fillDefaultSlots: () => patch(M.fillDefaultSlots),
    updateCharacter: (k, p) => patch(s => M.updateCharacter(s, k, p)),
    setPaletteColor: (k, c, v) => patch(s => M.setPaletteColor(s, k, c, v)),
    applyPreset: (k, id) => patch(s => M.applyPalettePreset(s, k, id)),
    setVoice: (k, p) => patch(s => M.setVoice(s, k, p)),
    setOption: (n, v) => patch(s => M.setOption(s, n, v)),
    addLine: after => tl(t => T.addLine(t, after)),
    removeLine: i => tl(t => T.removeLine(t, i)),
    moveLine: (i, d) => tl(t => T.moveLine(t, i, d)),
    updateLine: (i, p) => tl(t => T.updateLine(t, i, p)),
    duplicateLine: i => tl(t => T.duplicateLine(t, i)),
    // Задание после сцены «О чём диалог» (taskModel.js)
    setTaskKind: k => patch(s => TK.setTaskKind(s, k)),
    updateTask: p => patch(s => TK.updateTask(s, p)),
    addAccept: text => patch(s => TK.addAccept(s, text)),
    updateAccept: (i, v) => patch(s => TK.updateAccept(s, i, v)),
    removeAccept: i => patch(s => TK.removeAccept(s, i)),
    clearScene: () => patch(M.clearScene),
    // Загрузить сцену целиком (из JSON, нейросети, библиотеки): row — строка библиотеки, если есть
    load: (next, row = null) => {
      const s = M.fromScene(next)
      setScene(s)
      setSaved(row ? { id: row.id, status: row.status, snapshot: s } : { id: null, status: 'draft', snapshot: null })
      setRestoredAt(null)
    },
    // Новая сцена — отвязана от библиотеки
    reset: location => { setScene(M.newDraft(location)); setSaved({ id: null, status: 'draft', snapshot: null }); setRestoredAt(null); if (backup) clearBackup() },
    // После успешного сохранения в библиотеку
    markSaved: row => setSaved({ id: row.id, status: row.status, snapshot: M.fromScene(row.scene) }),
    detach: () => setSaved({ id: null, status: 'draft', snapshot: null }),
    dismissRestored: () => setRestoredAt(null),
  }), [patch, tl, backup])

  // Текст JSON → { ok, errors }; при успехе грузится в черновик (связь с библиотекой сохраняется)
  const applyJson = useCallback(text => {
    const r = parseSceneV2(text)
    if (r.scene) setScene(r.scene)
    return { ok: !!r.scene, errors: r.errors }
  }, [])

  return { scene, saved, dirty, lint, errors, budget, restoredAt, actions, applyJson, exportJson: () => M.exportJson(scene) }
}
