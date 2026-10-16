import { useCallback, useEffect, useRef } from 'react'
import { useFeedPaused, getFeedPaused } from '../feedPauseState.js'
import { unlockSceneAudio } from '../../scene/v2/sceneAudioUnlock.js'
import { unlockAllForSound } from '../videoPool.js'
import { straceGesture } from '../../../shared/lib/soundGestureTrace.js'
import { sceneNeedsOwnGesture } from '../../scene/v2/sceneAudioUnlock.js'
import { trackDedup } from '../../../shared/lib/analytics/trackDedup.js'
import { FEED_PAUSE } from '../../../shared/lib/analytics/eventNames.js'

// Поведение живой сцены на слайде ленты (SlideScene.jsx):
//  · автозапуск, как только слайд стал активным и рендерер живой (режиссёр
//    создаётся заново при каждом входе в live — сцена всегда с начала; уход
//    со слайда переводит рендерер в static → режиссёр уничтожен, речь отменена);
//  · пауза — общая с видео (feedPauseState): тап по сцене = пауза/пуск с тем же
//    событием feed_pause; уход со слайда снимает ручную паузу (как у видео);
//  · паузу/вкладку рендерер получает пропсами (paused / active) — режиссёр сам
//    встаёт и сам продолжает, когда условие снято;
//  · жесты (тап по сцене, чип звука) прогревают аудио сцены И пул видео — соседний
//    слайд может быть видео, ему тоже нужен жест;
//  · первый живой кадр → window.__pithyVideoShown (стартовый сплэш улетает).
export function useSlideScenePlay({ live, active, moduleId, soundOn: soundIsOn = false, onSoundOn, onSoundOff }) {
  const [paused, setPaused] = useFeedPaused()
  const apiRef = useRef(null)

  useEffect(() => {
    if (!live) return undefined
    apiRef.current?.play()
    const raf = requestAnimationFrame(() => window.__pithyVideoShown?.())
    return () => cancelAnimationFrame(raf)
  }, [live])

  // Ушли со слайда — ручная пауза сбрасывается (переход active → false, как в SlideVideo)
  const wasActiveRef = useRef(active)
  useEffect(() => {
    if (wasActiveRef.current && !active && getFeedPaused()) setPaused(false)
    wasActiveRef.current = active
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  const onTap = useCallback(() => {
    if (!active) return
    straceGesture('тап по сцене')
    const locked = soundIsOn && sceneNeedsOwnGesture()
    unlockSceneAudio()
    // Звук включён, а аудио сцен ещё закрыто (iOS): этот тап только открывает его, сцену на паузу не ставим
    if (locked) { onSoundOn?.(); return }
    const on = !getFeedPaused()
    trackDedup(FEED_PAUSE, { module_id: moduleId, on }, `${moduleId}:${on}`)
    setPaused(on)
  }, [active, moduleId, setPaused, soundIsOn, onSoundOn])

  const soundOn = useCallback(() => {
    straceGesture('чип звука на сцене')
    unlockAllForSound()
    unlockSceneAudio()
    onSoundOn?.()
  }, [onSoundOn])

  const soundOff = useCallback(() => { onSoundOff?.() }, [onSoundOff])

  return { paused, apiRef, onTap, soundOn, soundOff }
}
