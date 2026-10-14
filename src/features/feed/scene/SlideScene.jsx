import { memo, useMemo } from 'react'
import SceneRenderer from '../../scene/v2/SceneRenderer.jsx'
import { backgroundSprite } from '../../scene/v2/sprites/spriteRegistry.js'
import { perfFlags } from '../../../shared/lib/perfFlags.js'
import { useFeedSlow } from '../feedSlowState.js'
import { useSlideScenePlay } from './useSlideScenePlay.js'
import SlideSceneChips from './SlideSceneChips.jsx'
import { sceneLayerMode, loopedScene, sceneSound, sceneRate } from './slideSceneRules.js'

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
function SlideScene({
  scene, posterUrl = null, slideKey, moduleId = null, active = false, near = false, tabVisible = true,
  soundOn = false, soundEverOn = false, onSoundOn, onSoundOff,
}) {
  const wanted = sceneLayerMode({ active, near, noVideo: !!perfFlags.noVideo })
  const live = wanted === 'live' && tabVisible // скрытая вкладка: активный слайд стоит статичным кадром, речи нет
  const mode = live ? 'live' : wanted === 'live' ? 'static' : wanted
  const looped = useMemo(() => loopedScene(scene), [scene])
  const slow = useFeedSlow(slideKey)
  const pb = useSlideScenePlay({ live, active, moduleId, onSoundOn, onSoundOff })
  // SVG 9:16 лежит по верху слайда во всю ширину (коты выше блока фразы, лица не под шариками); остаток снизу —
  // цвет пола локации (feed-scene.css), полос нет
  const floor = backgroundSprite(scene?.location)?.colors?.floor ?? '#c9a27a'

  return (
    <div className="slideSceneRoot" data-mode={mode} style={{ '--scene-floor': floor }} onClick={pb.onTap}>
      {mode === 'skeleton' ? (
        posterUrl
          ? <div className="feedPosterBg" style={{ backgroundImage: `url("${posterUrl}")` }} />
          : <div className="feedSkeleton" />
      ) : (
        <SceneRenderer
          scene={looped} mode={mode} active={active && tabVisible} paused={pb.paused}
          sound={sceneSound(soundOn)} rate={sceneRate(slow)} showProgress={false} apiRef={pb.apiRef}
        />
      )}
      <SlideSceneChips
        paused={pb.paused} active={active} soundOn={soundOn} soundEverOn={soundEverOn}
        onSoundOn={pb.soundOn} onSoundOff={pb.soundOff}
      />
    </div>
  )
}

// memo: слайд перерисовывается на каждую клавишу «Ловли» — слой сцены от этого не меняется
export default memo(SlideScene)
