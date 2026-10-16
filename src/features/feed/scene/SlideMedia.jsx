import { memo } from 'react'
import SlideVideo from '../SlideVideo.jsx'
import SlideScene from './SlideScene.jsx'
import { useFeedScene } from './useFeedScene.js'
import { pickSlideMedia } from './slideSceneRules.js'
import { useSceneUserValues } from '../../scene/v2/useSceneUserValues.js'

// Медиа-слой слайда ленты: сцена (mod.sceneId) главнее видео. Сцена грузится
// только для окна (активный ± 1) и не блокирует ленту: пока 'loading' — постер
// или скелетон (как видео до первого кадра, без мигания видео→сцена); нет
// сцены / не опубликована / невалидна → прежнее видео (или заглушка fallback).
// Сцена-шаблон (vars): слова пользователя подставляются ДО монтирования режиссёра (useSceneUserValues: общий стор слов, зерно
// «день + id сцены», ожидание ≤ 500 мс, потом запасное слово и сцена не меняется); пока значения не готовы — тот же постер/скелетон.
// Хук работает только у слайдов окна (активный ± 1); у сцены без vars он ничего не делает и отдаёт ту же ссылку.
// Пропсы — ровно как у SlideVideo плюс sceneId; memo по той же причине.
function SlideMedia({ sceneId = null, ...props }) {
  const { active, near, posterUrl } = props
  const { scene: stored, status } = useFeedScene(sceneId, { enabled: !!sceneId && (active || near) })
  const { scene, ready } = useSceneUserValues(stored, { key: sceneId, enabled: active || near })
  const kind = pickSlideMedia({ sceneId, status, ready })
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
  return <SlideScene {...sceneProps} scene={scene} sceneId={sceneId} />
}

export default memo(SlideMedia)
