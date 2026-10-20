import { useEffect } from 'react'
import { getLessonMuted } from '../../lessonVolume.js'
import { sceneNeedsOwnGesture, sceneAudioUnlocked } from '../../../scene/v2/sceneAudioUnlock.js'
import { sceneSoloSeq, sceneSoloBusy, sceneGestureSeq } from './useSceneSolo.js'
import {
  startDecision, waitRowAppear, scheduleSceneStart, autoStartSound, pageHasBeenActive, autoStartYields,
} from './sceneStartPlan.js'

// Автозапуск сцены в ленте (вынесено из useScenePlayback.js по лимиту размера): 'auto' — после конца анимации появления сообщения
// + startDelayMs ноды (план и чистая логика — sceneStartPlan.js); звук — по политике автоплея (autoStartSound); уступает сцене,
// которую пользователь запустил, пока кружок ждал (autoStartYields). startedRef — общий с жестами хука (жест отменяет автозапуск),
// onPlay(withSound) — хук ставит soundBlocked и отправляет команду play режиссёру эффектом (флаг sound должен дойти до рендерера раньше).
export function useSceneAutoStart({ start, startDelayMs, isHistory, pending, hasScene, rootRef, startedRef, trace, onPlay }) {
  useEffect(() => {
    if (startDecision({ start, isHistory, pending, hasScene }) !== 'arm' || startedRef.current) return undefined
    const wait = waitRowAppear(rootRef.current, { onResolved: how => trace(`появление: ${how}`) })
    const armedSeq = sceneSoloSeq()
    const armedGesture = sceneGestureSeq()
    return scheduleSceneStart({
      waitAppear: wait, delayMs: startDelayMs, log: m => trace(`автозапуск: ${m}`),
      play: () => {
        if (startedRef.current) return
        // Пока кружок ждал, пользователь запустил другую сцену (тап по сцене в ленте) и она ещё играет — не перебиваем её:
        // кружок остаётся с ▶ и стартует по тапу
        if (autoStartYields({ armedGesture, gesture: sceneGestureSeq(), armedSeq, seq: sceneSoloSeq(), busy: sceneSoloBusy() })) { trace('автозапуск отменён: играет другая сцена'); return }
        startedRef.current = true
        const withSound = autoStartSound({ hasBeenActive: pageHasBeenActive(), needsGesture: sceneNeedsOwnGesture() })
        trace(`автозапуск play() sound=${withSound} (hasBeenActive=${pageHasBeenActive()} needsGesture=${sceneNeedsOwnGesture()} unlocked=${sceneAudioUnlocked()} muted=${getLessonMuted()})`)
        onPlay(withSound)
      },
    })
  }, [start, startDelayMs, isHistory, pending, hasScene, rootRef, startedRef, trace, onPlay]) // trace/onPlay — стабильные useCallback хука
}
