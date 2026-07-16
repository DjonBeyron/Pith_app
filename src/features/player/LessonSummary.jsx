import { useEffect, useRef, useState } from 'react'
import { getCurrentLevel } from '../../shared/lib/xpLevels.js'
import { TicketBlock, StarsBlock } from './SummaryBadges.jsx'
import XpTransfer from '../../shared/ui/XpTransfer.jsx'

// ── Confetti canvas ────────────────────────────────────────────────────────
const COLORS = ['#b6fe3b','#ff6b6b','#ffd93d','#6bcfff','#c77dff','#ff9f43','#ff6fd8']

function makeParticle(W) {
  return {
    x: Math.random() * W, y: -10 - Math.random() * 40,
    r: 5 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 3, vy: 2.5 + Math.random() * 2.5,
    angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.15,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }
}

function Confetti() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = canvas.width  = window.innerWidth
    let H = canvas.height = window.innerHeight
    let particles = Array.from({ length: 120 }, () => makeParticle(W))
    let rafId, done = false
    function tick() {
      ctx.clearRect(0, 0, W, H)
      let alive = 0
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.vy += 0.05
        if (p.y < H + 20) alive++
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, 1 - (p.y / H) * 0.6)
        if (p.shape === 'rect') ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r*0.6)
        else { ctx.beginPath(); ctx.arc(0,0,p.r/2,0,Math.PI*2); ctx.fill() }
        ctx.restore()
      }
      if (!done && particles.filter(p => p.y > H).length > 60) done = true
      if (!done) particles.push(makeParticle(W))
      if (alive > 0 || !done) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])
  return <canvas ref={canvasRef} style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:10001 }} />
}

// ── Main component ─────────────────────────────────────────────────────────
export default function LessonSummary({ earnedXp = 0, baseXp = 0, ticket = null, hintLimit = 3, stars = null, onClose }) {
  const totalXp   = baseXp + earnedXp
  const prevLevel = getCurrentLevel(baseXp)
  const newLevel  = getCurrentLevel(totalXp)
  const levelUp   = newLevel.level > prevLevel.level

  const [visible, setVisible] = useState(false)
  const [done,    setDone]    = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <>
      {levelUp && done && <Confetti />}
      <div className={`lessonSummaryOverlay${visible ? ' lessonSummaryOverlayVisible' : ''}`}>
        <div className="lessonSummaryCard">

          <div className="summaryTitle">Урок завершён</div>

          <XpTransfer baseXp={baseXp} earnedXp={earnedXp} onDone={() => setDone(true)} />

          <StarsBlock stars={stars} />
          <TicketBlock ticket={ticket} hintLimit={hintLimit} />

          {levelUp && (
            <div className={`summaryLevelUpBlock${done ? ' summaryLevelUpBlockVisible' : ''}`}>
              <div className="summaryLevelUpLabel">🏆 Новый уровень!</div>
              <div className="summaryLevelUpNum">Уровень {newLevel.level}</div>
              <div className="summaryLevelUpName">{newLevel.label}</div>
            </div>
          )}

          <button className="summaryCloseBtn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </>
  )
}
