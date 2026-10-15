import SceneRenderer from '../../../scene/v2/SceneRenderer.jsx'
import { sceneFrameKind } from './sceneNearModel.js'

// Содержимое рамки сцены в ленте (общее для пузыря и кружка): живой рендерер,
// статичный кадр или плашка (sceneNearModel.sceneFrameKind). Замороженная сцена —
// история ИЛИ доигравшая (ended): у неё нет режиссёра, аудио, наблюдателей и ни
// одной CSS-анимации, а далеко от экрана вместо ~190 SVG-узлов лежит один пустой
// div той же высоты (рамка держит размер сама, скачка нет). rootRef — корень рамки
// (его же наблюдает useSceneNear в виде-родителе: ref к layout-эффекту ребёнка ещё не
// прикреплён, поэтому near приходит пропом). onTap у статичного кадра — только у доигравшей (тап → полный
// экран / «ещё раз»); у истории тапа нет.
export default function SceneBody({
  scene, isHistory, ended, near, showBubbles, display, voice, showProgress, last,
  live, onTap,
}) {
  const kind = sceneFrameKind({ isHistory, ended, near })
  if (kind === 'placeholder') return <div className="scn scn--ph" aria-hidden="true" />
  if (kind === 'static') {
    return (
      <SceneRenderer
        scene={scene} mode="static" frameIndex={last} showBubbles={showBubbles} display={display}
        showProgress={false} onTap={isHistory ? undefined : onTap}
      />
    )
  }
  return <SceneRenderer scene={scene} mode="live" {...live} showBubbles={showBubbles} display={display} voice={voice} showProgress={showProgress} onTap={onTap} />
}
