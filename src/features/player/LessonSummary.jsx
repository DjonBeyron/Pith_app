import { useEffect, useRef, useState } from 'react'
import { getCurrentLevel, getNextLevel } from '../../shared/lib/xpLevels.js'

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

// ── XP transfer animation: number shrinks → dots fly to bar ───────────────
const ANIM_MS        = 2600   // total animation duration
const PARTICLE_FLY   = 520    // ms each dot takes to fly
const PARTICLE_EVERY = 110    // ms between spawning new dots

function XpTransfer({ earnedXp, baseXp, onDone }) {
  const totalXp    = baseXp + earnedXp
  const finalLevel = getCurrentLevel(totalXp)
  const finalNext  = getNextLevel(totalXp)

  // Use the STARTING level as reference so the bar always fills forward
  const startLevel = getCurrentLevel(baseXp)
  const startNext  = getNextLevel(baseXp)
  const rangeStart = startLevel.xpNeeded
  const rangeEnd   = startNext ? startNext.xpNeeded : rangeStart + Math.max(earnedXp, 100)
  const rangeSize  = rangeEnd - rangeStart
  const initPct    = Math.max(0, ((baseXp  - rangeStart) / rangeSize) * 100)
  const finalPct   = Math.min(((totalXp - rangeStart) / rangeSize) * 100, 100)



  // Bar width as React state — CSS transition handles smooth movement
  const [barPct, setBarPct] = useState(initPct)

  const numRef      = useRef(null)
  const xpNumRef    = useRef(null)
  const barBgRef    = useRef(null)
  const barFillRef  = useRef(null)
  const rewardRef   = useRef(null)   // label + number wrapper
  const canvasRef   = useRef(null)
  const wrapRef     = useRef(null)

  // Kick off bar CSS transition after mount
  useEffect(() => {
    if (!earnedXp) { onDone?.(); return }
    const id = setTimeout(() => setBarPct(finalPct), 80)
    return () => clearTimeout(id)
  }, []) // eslint-disable-line

  // rAF loop: number countdown + particles (independent of bar state)
  useEffect(() => {
    if (!earnedXp) return
    const particles = []
    let lastSpawn   = 0
    const startTime = performance.now()
    let raf

    function tick(now) {
      const elapsed = now - startTime
      const t       = Math.min(elapsed / ANIM_MS, 1)
      const eased   = 1 - Math.pow(1 - t, 2)
      const curXp   = Math.round(earnedXp * (1 - eased))
      const curPct  = initPct + (finalPct - initPct) * eased

      // Direct DOM: number + small counter (numRef — только цифры, частицы
      // стартуют из центра именно цифр, даже когда осталась одна)
      if (numRef.current)   numRef.current.textContent   = curXp
      if (xpNumRef.current) xpNumRef.current.textContent = (baseXp + earnedXp - curXp) + ' XP'

      // Spawn particles
      if (elapsed - lastSpawn > PARTICLE_EVERY && t < 0.92) {
        particles.push({ born: now })
        lastSpawn = elapsed
      }

      // Canvas particles
      const canvas = canvasRef.current
      const wrap   = wrapRef.current
      const numEl  = numRef.current
      const barBg  = barBgRef.current
      if (canvas && wrap && numEl && barBg) {
        // Канвас шире зоны на BLEED с каждой стороны (inset: -40px в CSS) —
        // свечение частиц у краёв не режется границей канваса
        const BLEED = 40
        const wr = wrap.getBoundingClientRect()
        canvas.width  = wr.width  + BLEED * 2
        canvas.height = wr.height + BLEED * 2
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const nr = numEl.getBoundingClientRect()
        const sx = nr.left - wr.left + BLEED + nr.width  / 2
        const sy = nr.top  - wr.top  + BLEED + nr.height / 2

        const br = barBg.getBoundingClientRect()
        const tx = br.left - wr.left + BLEED + br.width * (curPct / 100)
        const ty = br.top  - wr.top  + BLEED + br.height / 2

        for (const p of particles) {
          const pt = Math.min((now - p.born) / PARTICLE_FLY, 1)
          if (pt >= 1) { p.dead = true; continue }
          const cpx = (sx + tx) / 2
          const cpy = sy + (ty - sy) * 0.4 - 20
          const bx  = (1-pt)*(1-pt)*sx + 2*(1-pt)*pt*cpx + pt*pt*tx
          const by  = (1-pt)*(1-pt)*sy + 2*(1-pt)*pt*cpy + pt*pt*ty
          const alpha = pt < 0.12 ? pt/0.12 : pt > 0.78 ? (1-pt)/0.22 : 1
          ctx.beginPath()
          ctx.arc(bx, by, 4.5 * (1 - pt * 0.35), 0, Math.PI * 2)
          ctx.fillStyle   = `rgba(182,254,59,${alpha})`
          ctx.shadowBlur  = 10
          ctx.shadowColor = '#b6fe3b'
          ctx.fill()
          ctx.shadowBlur  = 0
        }
        for (let i = particles.length - 1; i >= 0; i--) {
          if (particles[i].dead) particles.splice(i, 1)
        }
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        if (numRef.current)   numRef.current.textContent   = '0'
        if (xpNumRef.current) xpNumRef.current.textContent = totalXp + ' XP'
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
        // Switch shimmer to slow after fill
        if (barFillRef.current) {
          barFillRef.current.classList.remove('summaryXpBarFillShimmer')
          barFillRef.current.classList.add('summaryXpBarFillShimmer', 'summaryXpBarFillShimmerSlow')
        }
        // Brief pause then fade out reward block using real height for smooth collapse
        setTimeout(() => {
          const el = rewardRef.current
          if (el) {
            const h = el.offsetHeight
            el.style.height   = h + 'px'
            el.style.overflow = 'hidden'
            // Force reflow so browser registers the start height before transitioning
            el.getBoundingClientRect()
            el.style.transition = 'height 0.9s cubic-bezier(0.4,0,0.2,1), opacity 0.7s ease, margin-bottom 0.9s cubic-bezier(0.4,0,0.2,1)'
            el.style.height      = '0'
            el.style.opacity     = '0'
            el.style.marginBottom = '0'
          }
          setTimeout(() => onDone?.(), 950)
        }, 400)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line

  return (
    <div ref={wrapRef} className="summaryXpTransferWrap">
      <canvas ref={canvasRef} className="summaryXpTransferCanvas" />

      <div ref={rewardRef} className="summaryRewardBlock">
        <div className="summaryRewardLabel">Награда за урок</div>
        <div className="summaryXpEarned">
          +<span ref={numRef}>{earnedXp}</span><span className="summaryXpUnit">XP</span>
        </div>
      </div>

<div className="summaryXpBarSection">
        <div className="summaryXpBarLabels">
          <span>{finalLevel.label} (Ур. {finalLevel.level})</span>
          {finalNext && <span>{finalNext.label} (Ур. {finalNext.level})</span>}
        </div>
        <div ref={barBgRef} className="summaryXpBar">
          <div
            ref={barFillRef}
            className="summaryXpBarFill summaryXpBarFillShimmer"
            style={{ width: barPct + '%', transition: barPct === initPct ? 'none' : `width ${ANIM_MS}ms cubic-bezier(0.4,0,0.2,1)` }}
          />
        </div>
        <div className="summaryXpNumbers">
          <span ref={xpNumRef}>{baseXp} XP</span>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function LessonSummary({ earnedXp = 0, baseXp = 0, onClose }) {
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
