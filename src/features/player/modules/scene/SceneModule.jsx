import { useMemo, useState } from 'react'
import { resolveSceneNode } from '../../../scene/v2/sceneNode.js'
import SceneFallback from './SceneFallback.jsx'
import SceneBubbleView from './SceneBubbleView.jsx'
import SceneCircleView from './SceneCircleView.jsx'
import SceneFullscreenView from './SceneFullscreenView.jsx'
import { useScenePlayback } from './useScenePlayback.js'
import { sceneAudioSrcOf } from './sceneNodeAudio.js'

// Нода урока `scene` — SVG-сцена «два кота говорят» вместо видео. Данные:
// typeData.scene = { scene: снимок v2, sceneId?, mode: 'bubble' | 'circle',
// showBubbles, start?: 'manual' | 'auto', startDelayMs?, display?, voice? }
// (sceneNode.js; display/voice — переопределения режима показа текста и озвучки
// поверх options сцены). Одна нода — два вида: пузырь (SceneBubbleView) и кружок
// (SceneCircleView); поведение общее (useScenePlayback.js): старт после анимации
// появления (+ задержка ноды) или вручную, тап → полный экран
// (SceneFullscreenView — свой рендерер, реплика переносится состоянием). Триггер
// графа — 'played' (сцена доиграла последнюю реплику). Невалидная сцена →
// SceneFallback (текст реплик + «Дальше»), урок не зависает.
//
// Сцена фиксируется на маунте (useState): typeData у ноды в уроке не меняется,
// а пересборка объекта сцены пересоздала бы режиссёра посреди реплики.
// lessonFiles — файлы урока с прогревом (withBlobs): озвучка реплик (audioUrl)
// играет из blob, если он уже скачан (sceneNodeAudio.js), иначе по ссылке.
export default function SceneModule({ node, lessonFiles = null, onDone, adminPreview = false, pending = false }) {
  const [resolved] = useState(() => resolveSceneNode(node.typeData?.scene))
  const isHistory = !!node.isHistory
  const pb = useScenePlayback({ resolved, pending, isHistory, onDone })
  const audioSrcOf = useMemo(() => sceneAudioSrcOf(lessonFiles), [lessonFiles])

  if (!resolved.scene) {
    return (
      <SceneFallback
        raw={node.typeData?.scene?.scene ?? null} errors={resolved.errors}
        pending={pending} adminPreview={adminPreview} onDone={onDone}
      />
    )
  }
  const View = resolved.mode === 'circle' ? SceneCircleView : SceneBubbleView
  const common = { scene: resolved.scene, showBubbles: resolved.showBubbles, display: resolved.display, voice: resolved.voice, audioSrcOf }
  return (
    <>
      <View
        {...common} isHistory={isHistory} ended={pb.ended} pending={pending}
        status={pb.state.status} index={pb.state.index} total={pb.state.total}
        paused={pb.paused || pb.fsOpen} sound={pb.sound} rate={pb.rate}
        soundChip={pb.soundChip} onEnableSound={pb.enableSound}
        apiRef={pb.apiRef} rootRef={pb.rootRef} onState={pb.onState} onTap={pb.handleTap}
      />
      {pb.fsOpen && (
        <SceneFullscreenView
          {...common} paused={pb.paused} sound={pb.sound} muted={pb.muted} rate={pb.rate}
          status={pb.state.status} apiRef={pb.fsApiRef} onState={pb.onFsState} rootRef={pb.rootRef}
          onTogglePause={pb.togglePause} onClose={pb.closeFs}
        />
      )}
    </>
  )
}
