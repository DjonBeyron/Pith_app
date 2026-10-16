import { memo, useEffect, useRef, useState } from 'react'
import SceneRenderer from '../../scene/v2/SceneRenderer.jsx'

// Миниатюра сцены (размеры/кружок — классы nodeScenePreview из scene-picker.css, как в пикере ноды): статичный кадр SceneRenderer (без режиссёра, звука и анимаций), и то лениво —
// рисуется, только когда строка первый раз попала на экран. Один общий IntersectionObserver на
// все миниатюры; увидели строку — сразу отписываемся, дальше подписок нет (бюджет слабого телефона).
const waiting = new Map() // el -> callback
let io = null
function observe(el, cb) {
  if (typeof IntersectionObserver === 'undefined') { cb(); return () => {} }
  io ??= new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      const fn = waiting.get(e.target)
      waiting.delete(e.target)
      io.unobserve(e.target)
      fn?.()
    }
  }, { rootMargin: '120px' })
  waiting.set(el, cb)
  io.observe(el)
  return () => { waiting.delete(el); io?.unobserve(el) }
}

function SceneThumb({ scene, mode, empty = '🐱' }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!scene || seen || !ref.current) return undefined
    return observe(ref.current, () => setSeen(true))
  }, [scene, seen])
  return (
    <div ref={ref} className={`nodeScenePreview nodeScenePreview--${mode} scTabThumb`} aria-hidden="true" data-seen={seen ? '1' : '0'}>
      {scene
        ? (seen ? <SceneRenderer scene={scene} mode="static" showBubbles={false} lite /> : null)
        : <div className="nodeScenePreviewEmpty">{empty}</div>}
    </div>
  )
}

export default memo(SceneThumb)
