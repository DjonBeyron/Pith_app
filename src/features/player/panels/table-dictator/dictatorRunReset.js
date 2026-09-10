import { computeRevealedCellIds } from '../../../../shared/lib/tableDictatorTiming.js'

// Полный сброс состояния диктанта в начало прогона — вынесено из
// TableDictatorPanel.jsx (startRun). Прогон может стартовать не один раз за
// жизнь панели (повторное нажатие play, подстраховка часами без звука), и
// каждый раз должно обнулиться ВСЁ: и состояния React, и рефы RAF-сценария.
// Держать этот список отдельно проще, чем следить, не забыт ли новый флаг
// среди прочей логики панели.
export function resetDictatorRun({
  timeline, toChatCtl,
  setPlaying, setAssembled, setExtrasAssembled, setResult, setPhase, setChipsVisible,
  setHighlighted, setUsedCells, setActiveExtraKeys, setRevealedIds,
  addedCellsRef, clearedRef, assembledRef, prevActiveRef, prevExtraRef,
  rfxPhaseRef, rfxChipsRef, rfxAssembRef, rfxCheckRef, rfxCloseRef, closedRef,
  closeTriggerRef, closeVariantRef,
}) {
  setPlaying(true)
  setAssembled([])
  setExtrasAssembled([])
  setResult(null)
  setPhase(null)
  setChipsVisible(false)
  addedCellsRef.current = new Set()
  clearedRef.current    = new Set()
  assembledRef.current  = []
  prevActiveRef.current = new Set()
  prevExtraRef.current  = new Set()
  rfxPhaseRef.current   = false
  rfxChipsRef.current   = false
  rfxAssembRef.current  = false
  rfxCheckRef.current   = false
  rfxCloseRef.current   = false
  closedRef.current     = false
  toChatCtl.reset()
  closeTriggerRef.current = null
  closeVariantRef.current = null
  setHighlighted(new Set()); setUsedCells(new Set())
  setActiveExtraKeys(new Set())
  setRevealedIds(computeRevealedCellIds(timeline?.layers, 0))
}
