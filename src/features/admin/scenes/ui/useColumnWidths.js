import { useState, useEffect, useCallback, useMemo } from 'react'
import { uiRead, uiWrite } from './uiStore.js'
import { DEFAULT_FRACTIONS, validFractions, normalize, resetFractions, cssVars } from './columnResize.js'

export const COLS_KEY = 'cols'

// Ширины трёх колонок сборщика долями (columnResize.js), хранятся локально (uiStore «cols»).
// В разметку уходят CSS-переменными --scb-c1..3 (fr) на .scbBody: во время перетаскивания
// ColumnResizer пишет их прямо в style узла (без setState и перерисовки сцены), а сюда
// попадает только итог (commit) — одна перерисовка на жест.
export function useColumnWidths() {
  const [fractions, setFractions] = useState(() => normalize(uiRead(COLS_KEY, DEFAULT_FRACTIONS, { validate: validFractions })))
  useEffect(() => { uiWrite(COLS_KEY, fractions) }, [fractions])
  const commit = useCallback(fr => setFractions(normalize(fr)), [])
  const reset = useCallback(() => setFractions(resetFractions()), [])
  const style = useMemo(() => cssVars(fractions), [fractions])
  return { fractions, style, commit, reset }
}
