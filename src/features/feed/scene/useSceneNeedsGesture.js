import { useSyncExternalStore } from 'react'
import { subscribeSceneAudio, sceneNeedsOwnGesture } from '../../scene/v2/sceneAudioUnlock.js'

// true — звук в ленте включён жестом на видео, а аудио сцен на iOS ещё не открыто (см. SCENE_AUDIO_EAGER_UNLOCK):
// слайд-сцена показывает чип «Включить звук», тап по сцене/чипу открывает аудио сцен
export function useSceneNeedsGesture() {
  return useSyncExternalStore(subscribeSceneAudio, sceneNeedsOwnGesture, () => false)
}
