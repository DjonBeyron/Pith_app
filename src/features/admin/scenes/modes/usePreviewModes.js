import { useState, useMemo, useCallback } from 'react'
import { EMPTY_OVERRIDE, effectiveModes, overriddenFlags, setOverride, overrideProps, hasOverride } from './sceneModes.js'

// Предпросмотровые переопределения режимов показа и озвучки в окне сборщика (чистая логика —
// sceneModes.js). override живёт только в окне: уходит пропами display/voice в SceneRenderer
// (PhonePreview), сцену не меняет, поэтому SceneRenderer не пересоздаётся и черновик не «грязнится».
// makeDefault — записать в options (draft.actions.applyModes) и снять переопределение.
export function usePreviewModes(draft) {
  const [override, setOv] = useState(EMPTY_OVERRIDE)
  const scene = draft.scene
  const effective = useMemo(() => effectiveModes(scene, override), [scene, override])
  const overridden = useMemo(() => overriddenFlags(scene, override), [scene, override])
  const set = useCallback((key, value) => setOv(o => setOverride(o, draft.scene, key, value)), [draft.scene])
  const makeDefault = useCallback(() => {
    if (!hasOverride(override)) return
    draft.actions.applyModes(override)
    setOv(EMPTY_OVERRIDE)
  }, [draft.actions, override])
  const reset = useCallback(() => setOv(EMPTY_OVERRIDE), [])
  const props = useMemo(() => overrideProps(override), [override])
  return useMemo(() => ({ override, effective, overridden, set, makeDefault, reset, props }), [override, effective, overridden, set, makeDefault, reset, props])
}
