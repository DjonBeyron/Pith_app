import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveFeedFrame, isDefaultFeedFrame } from '../../../scene/v2/sceneFeedFrame.js'
import { frameKey } from './feedFrameModel.js'

// Локальный кадр предпросмотра: слайдеры и перетаскивание меняют его мгновенно (макет перерисовывается сам), а в черновик
// сцены кадр уходит с задержкой / по отпусканию — не на каждый тик: черновик пересчитывает линтер и бюджет. Если сцену
// изменили снаружи (другая сцена, «Сбросить» в параметрах, JSON) — локальный кадр подхватывает её значение; свои же
// записи (issued) за внешние не считаются.
const COMMIT_DELAY = 250

export function useFeedFrameDraft(scene, onWrite) {
  const savedKey = frameKey(scene.options?.feedFrame)
  const [frame, setFrame] = useState(() => resolveFeedFrame(scene.options))
  const [seen, setSeen] = useState(savedKey) // какой кадр сцены уже учтён
  const [issued, setIssued] = useState(savedKey) // какой кадр записали мы сами
  const latest = useRef(frame)
  const timer = useRef(null)
  // Сцена изменилась не нами → берём её кадр (переход в рендере, не эффект)
  if (savedKey !== seen) {
    setSeen(savedKey)
    if (savedKey !== issued) { setFrame(resolveFeedFrame(scene.options)); setIssued(savedKey) }
  }
  useEffect(() => { latest.current = frame }, [frame])
  const write = useCallback(() => {
    clearTimeout(timer.current)
    const f = latest.current
    setIssued(frameKey(f))
    onWrite(isDefaultFeedFrame(f) ? null : f)
  }, [onWrite])
  const change = useCallback((next, { now = false } = {}) => {
    latest.current = next
    setFrame(next)
    clearTimeout(timer.current)
    if (now) write()
    else timer.current = setTimeout(write, COMMIT_DELAY)
  }, [write])
  const reset = useCallback(() => change(resolveFeedFrame(undefined), { now: true }), [change])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { frame, change, commit: write, reset, isDefault: isDefaultFeedFrame(frame) }
}
