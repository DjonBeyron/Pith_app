import { useMemo } from 'react'
import { resolveSceneNode } from '../../../scene/v2/sceneNode.js'
import { useSceneUserValues } from '../../../scene/v2/useSceneUserValues.js'
import { sceneNodeKey } from '../../../scene/v2/warmUserScenes.js'
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
// появления (+ задержка ноды) или вручную; тап по пузырю → полный экран (SceneFullscreenView — свой
// рендерер, реплика переносится состоянием), тап по кружку → он увеличивается как видео-кружок
// (useSceneCircleExpand.js). crop ноды — масштаб/сдвиг кадра как у видео (sceneNodeCrop.js). Триггер
// графа — 'played' (сцена доиграла последнюю реплику). Невалидная сцена →
// SceneFallback (текст реплик + «Дальше»), урок не зависает.
//
// Сцена пересчитывается только при смене ССЫЛКИ на typeData.scene (useMemo): в уроке она не меняется, режиссёр посреди реплики
// не пересоздаётся; в режиме разбора правка кадра (crop) и реплик в окне замечания применяется сразу.
// Сцена-шаблон (vars): слова пользователя подставляются ДО старта режиссёра (useSceneUserValues: общий стор слов, зерно
// «день + id сцены», ожидание ≤ 500 мс, потом запасное слово); пока значения не готовы, автозапуск и тап не работают, а после
// готовности сцена больше не меняется. Нода в истории слов не грузит — запасное слово. Тот же модуль играет карточки повтора.
// lessonFiles — файлы урока с прогревом (withBlobs): озвучка реплик (audioUrl)
// играет из blob, если он уже скачан (sceneNodeAudio.js), иначе по ссылке.
export default function SceneModule({ node, lessonFiles = null, onDone, adminPreview = false, pending = false, bottomOffset = 0 }) {
  const sceneData = node.typeData?.scene
  const raw = useMemo(() => resolveSceneNode(sceneData, { fill: false }), [sceneData])
  const isHistory = !!node.isHistory
  const user = useSceneUserValues(raw.scene, { key: sceneNodeKey(node), enabled: !isHistory })
  const resolved = useMemo(() => (user.scene === raw.scene ? raw : { ...raw, scene: user.scene }), [raw, user.scene])
  const pb = useScenePlayback({ resolved, pending, isHistory, onDone, ready: user.ready || isHistory })
  const audioSrcOf = useMemo(() => sceneAudioSrcOf(lessonFiles), [lessonFiles])

  if (!resolved.scene) {
    return (
      <SceneFallback
        raw={node.typeData?.scene?.scene ?? null} errors={resolved.errors}
        pending={pending} adminPreview={adminPreview} onDone={onDone}
      />
    )
  }
  const common = {
    scene: resolved.scene, showBubbles: resolved.showBubbles, display: resolved.display, voice: resolved.voice, crop: resolved.crop, audioSrcOf,
  }
  const st = pb.state
  const live = {
    isHistory, ended: pb.ended, pending, status: st.status, index: st.index, run: st.run, at: st.at, total: st.total,
    paused: pb.paused || pb.fsOpen, sound: pb.sound, rate: pb.rate, soundChip: pb.soundChip, onEnableSound: pb.enableSound,
    apiRef: pb.apiRef, rootRef: pb.rootRef, onState: pb.onState,
  }
  return (
    <>
      {resolved.mode === 'circle'
        ? <SceneCircleView {...common} {...live} bottomOffset={bottomOffset} onExpand={pb.expandPlay} onFreeze={pb.freeze} />
        : <SceneBubbleView {...common} {...live} onTap={pb.handleTap} />}
      {pb.fsOpen && (
        <SceneFullscreenView
          {...common} paused={pb.paused} sound={pb.sound} muted={pb.muted} rate={pb.rate}
          status={st.status} index={st.index} run={st.run} at={st.at}
          apiRef={pb.fsApiRef} onState={pb.onFsState} rootRef={pb.rootRef}
          onTogglePause={pb.togglePause} onClose={pb.closeFs}
        />
      )}
    </>
  )
}
