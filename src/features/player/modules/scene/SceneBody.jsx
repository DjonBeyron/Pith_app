import { memo } from 'react'
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
function SceneBody({
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

// Рамка сцены перерисовывается только когда поменялось то, что она реально показывает. Родитель (кружок) ре-рендерится на
// раскрытие/сворачивание, смену статуса, вход рамки в зону экрана — а живой SVG (~190 узлов + облачко) от этого не меняется;
// без memo каждый такой рендер сверял всё дерево сцены заново (замер Galaxy-A50-эмуляции 4×: ~100 мс в первом кадре
// раскрытия кружка, анимация роста стояла). live — новый объект на каждый рендер родителя, поэтому сравниваем его по полям
const same = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => (k === 'live' ? sameLive(a.live, b.live) : Object.is(a[k], b[k])))
}
const sameLive = (a, b) => a === b || (!!a && !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.is(a[k], b[k])))

export default memo(SceneBody, same)
