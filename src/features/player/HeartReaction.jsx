import { useEffect, useRef } from 'react'

// Angles (degrees) and distances for each flying particle
const PARTICLES = [
  { angle: -80,  dist: 38 },
  { angle: -30,  dist: 44 },
  { angle:  10,  dist: 40 },
  { angle:  55,  dist: 42 },
  { angle: 100,  dist: 36 },
  { angle: 150,  dist: 40 },
  { angle: -130, dist: 38 },
]

export default function HeartReaction({ variant = '' }) {
  const particleRefs = useRef([])

  useEffect(() => {
    particleRefs.current.forEach((el, i) => {
      if (!el) return
      const { angle, dist } = PARTICLES[i]
      const rad = (angle * Math.PI) / 180
      const tx  = Math.cos(rad) * dist
      const ty  = Math.sin(rad) * dist

      el.animate(
        [
          { transform: 'translate(0,0) scale(0)',   opacity: 0 },
          { transform: `translate(${tx * 0.3}px,${ty * 0.3}px) scale(1.2)`, opacity: 1,   offset: 0.2 },
          { transform: `translate(${tx}px,${ty}px) scale(0.6)`,             opacity: 0.6, offset: 0.7 },
          { transform: `translate(${tx * 1.3}px,${ty * 1.3}px) scale(0)`,  opacity: 0 },
        ],
        { duration: 1360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      )
    })
  }, [])

  return (
    <div className={`heartReaction${variant ? ` heartReaction${variant}` : ''}`} aria-hidden="true">
      {PARTICLES.map((_, i) => (
        <span
          key={i}
          ref={el => { particleRefs.current[i] = el }}
          className="heartParticle"
        >
          🩷
        </span>
      ))}
      <span className="heartPermanent">❤️</span>
    </div>
  )
}
