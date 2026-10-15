import { memo, useMemo, useRef } from 'react'
import SceneRendererRaw from '../../scene/v2/SceneRenderer.jsx'
import { backgroundSprite } from '../../scene/v2/sprites/spriteRegistry.js'
import { perfFlags } from '../../../shared/lib/perfFlags.js'
import { useFeedSlow } from '../feedSlowState.js'
import { useSlideScenePlay } from './useSlideScenePlay.js'
import SlideSceneChips from './SlideSceneChips.jsx'
import SceneTaskPanel from './SceneTaskPanel.jsx'
import { useSceneTask } from './useSceneTask.js'
import { useSceneAudioPrefetch } from './useSceneAudioPrefetch.js'
import { useFeedFrame } from './useFeedFrame.js'
import { isSolo } from '../../scene/v2/scenePit.js'
import { sceneLayerMode, loopedScene, sceneSound, sceneRate } from './slideSceneRules.js'

// SceneRenderer без memo перерисовывал всё SVG-дерево сцены на каждое изменение состояния задания (тап по микрофону, «Готово»: ~45 мс на
// CPU 4× — ровно на первом кадре ухода панели). Его пропсы стабильны (scene — loopedScene из useMemo, onState/apiRef — стабильные, остальное
// примитивы), поэтому рендер сцены пропускается, пока она сама не меняется.
const SceneRenderer = memo(SceneRendererRaw)

// Слой сцены «два кота говорят» на слайде ленты — тот же контракт, что у
// SlideVideo (active/near/tabVisible/soundOn/…), вместо <video> — SceneRenderer:
//   active → live (режиссёр, облачки, рот, голос при soundOn; по кругу, как
//            зацикленное видео); perfFlags.noVideo → статичный кадр;
//   near   → static: первый кадр без анимаций и аудио (прогрев соседа);
//   далеко → постер/скелетон, как у видео.
// Живая сцена одновременно — только на активном слайде. Слабое устройство → lite
// (решает сам SceneRenderer по deviceTier). data-scrolling у .feedSwiper ставит
// CSS-анимации котов на паузу (scene-v2-cat.css — селектор по любому предку).
// Замедление 0.5x (зона над лайком) приходит через feedSlowState → rate.
// Задание «О чём диалог» (useSceneTask): сцена с заданием у режиссёра не зациклена (loopedScene) — после первого полного
// круга она стоит на последней реплике, снизу выезжает панель (SceneTaskCover); пока панель в DOM — режиссёр стоит
// (freeze → paused), свайп заблокирован (onLock); панель ушла — круг заново (play из useSceneTask).
function SlideScene({
  scene, sceneId = null, posterUrl = null, slideKey, moduleId = null, active = false, near = false, tabVisible = true,
  soundOn = false, soundEverOn = false, onSoundOn, onSoundOff, onLock, frameIndex = null,
}) {
  const wanted = sceneLayerMode({ active, near, noVideo: !!perfFlags.noVideo })
  const live = wanted === 'live' && tabVisible // скрытая вкладка: активный слайд стоит статичным кадром, речи нет
  const mode = live ? 'live' : wanted === 'live' ? 'static' : wanted
  const looped = useMemo(() => loopedScene(scene), [scene])
  const slow = useFeedSlow(slideKey)
  const pb = useSlideScenePlay({ live, active, moduleId, onSoundOn, onSoundOff })
  const task = useSceneTask({ scene, sceneId, active, live, apiRef: pb.apiRef, onLock, soundOn })
  useSceneAudioPrefetch({ scene, active, near }) // сосед: первая реплика в кэш озвучки заранее (useSceneAudioPrefetch.js)
  // Кадр сцены (useFeedFrame / feedFrameCalc.js): ноги котов — над блоком фразы и кнопкой, лишний верх уходит за край;
  // пол сцены продолжается вниз за viewBox (backgrounds.js), градиент корня (feed-scene.css) — только запасной фон под скелетоном
  const colors = backgroundSprite(scene?.location)?.colors
  const floor = colors?.floor ?? '#c9a27a'
  const wall = colors?.wall ?? '#e8eef5'
  const rootRef = useRef(null)
  useFeedFrame(rootRef, scene?.options?.feedFrame, isSolo(scene)) // кадрирование (options.feedFrame + размер слайда) → CSS-переменные

  return (
    <div ref={rootRef} className="slideSceneRoot" data-mode={mode} style={{ '--scene-floor': floor, '--scene-wall': wall }} onClick={pb.onTap}>
      {mode === 'skeleton' ? (
        posterUrl
          ? <div className="feedPosterBg" style={{ backgroundImage: `url("${posterUrl}")` }} />
          : <div className="feedSkeleton" />
      ) : (
        <SceneRenderer
          scene={looped} mode={mode} active={active && tabVisible} paused={pb.paused || task.freeze}
          frameIndex={frameIndex} sound={sceneSound(soundOn)} rate={sceneRate(slow)} showProgress={false} apiRef={pb.apiRef} onState={task.onState}
        />
      )}
      {task.mounted && task.info && <SceneTaskPanel task={task} apiRef={pb.apiRef} total={scene?.timeline?.length ?? 0} />}
      <SlideSceneChips
        paused={pb.paused} active={active} soundOn={soundOn} soundEverOn={soundEverOn}
        onSoundOn={pb.soundOn} onSoundOff={pb.soundOff}
      />
    </div>
  )
}

// memo: слайд перерисовывается на каждую клавишу «Ловли» — слой сцены от этого не меняется
export default memo(SlideScene)
