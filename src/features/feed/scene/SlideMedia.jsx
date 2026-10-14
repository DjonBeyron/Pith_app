import { memo } from 'react'
import SlideVideo from '../SlideVideo.jsx'
import SlideScene from './SlideScene.jsx'
import { useFeedScene } from './useFeedScene.js'
import { pickSlideMedia } from './slideSceneRules.js'

// Медиа-слой слайда ленты: сцена (mod.sceneId) главнее видео. Сцена грузится
// только для окна (активный ± 1) и не блокирует ленту: пока 'loading' — постер
// или скелетон (как видео до первого кадра, без мигания видео→сцена); нет
// сцены / не опубликована / невалидна → прежнее видео (или заглушка fallback).
// Пропсы — ровно как у SlideVideo плюс sceneId; memo по той же причине.
function SlideMedia({ sceneId = null, ...props }) {
  const { active, near, posterUrl } = props
  const { scene, status } = useFeedScene(sceneId, { enabled: !!sceneId && (active || near) })
  const kind = pickSlideMedia({ sceneId, status })
  if (kind === 'video') return <SlideVideo {...props} />
  if (kind === 'wait') {
    return (
      <div className="slideVideoRoot" data-media="wait">
        {posterUrl
          ? <div className="feedPosterBg" style={{ backgroundImage: `url("${posterUrl}")` }} />
          : <div className="feedSkeleton" />}
      </div>
    )
  }
  const { videoUrl: _v, onSoundBlocked: _b, fallback: _f, ...sceneProps } = props
  return <SlideScene {...sceneProps} scene={scene} />
}

export default memo(SlideMedia)
