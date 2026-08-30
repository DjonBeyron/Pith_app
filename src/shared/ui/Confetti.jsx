import { useEffect, useRef } from 'react'

// Салют на канвасе. Один и тот же на финале урока (новый уровень) и на верном
// ответе — разница только в настройках: на ответе он короче и реже, потому что
// верных ответов в уроке десятки, и полноразмерный праздник на каждом обесценил
// бы и себя, и настоящий уровень.
//
// count    — сколько частиц в первой волне;
// refill   — досыпать ли новые, пока летят старые (финал — да, ответ — нет);
// topOnly  — падать не через весь экран, а только по верхней его части.
const COLORS = ['#b6fe3b', '#ff6b6b', '#ffd93d', '#6bcfff', '#c77dff', '#ff9f43', '#ff6fd8']

function makeParticle(W, size) {
  return {
    x: Math.random() * W, y: -10 - Math.random() * 40,
    r: size + Math.random() * size,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 3, vy: 2.5 + Math.random() * 2.5,
    angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.15,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }
}

export default function Confetti({ count = 120, refill = true, size = 5, fallRatio = 1 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width  = window.innerWidth
    const H = canvas.height = window.innerHeight
    // Докуда летим. На ответе частицы гаснут в верхней части экрана: салют
    // должен быть замечен краем глаза, а не перекрыть переписку целиком
    const bottom = H * fallRatio

    let particles = Array.from({ length: count }, () => makeParticle(W, size))
    let rafId
    let done = false

    function tick() {
      ctx.clearRect(0, 0, W, H)
      let alive = 0
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.vy += 0.05
        if (p.y < bottom + 20) alive++
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, 1 - (p.y / bottom) * 0.9)
        if (p.shape === 'rect') ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6)
        else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      }
      if (!done && particles.filter(p => p.y > bottom).length > count / 2) done = true
      if (refill && !done) particles.push(makeParticle(W, size))
      if (alive > 0) rafId = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W, H)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [count, refill, size, fallRatio])

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10001 }} />
}
