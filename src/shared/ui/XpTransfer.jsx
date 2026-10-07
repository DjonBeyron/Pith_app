import { useEffect, useRef, useState } from 'react'
import { getCurrentLevel, getNextLevel } from '../lib/xpLevels.js'
import { particleShares, departGap } from '../lib/xpTransferPlan.js'
import { playSound, warmSound } from '../lib/sounds.js'

// XP-transfer анимация: счётчик «+N XP» → шарики летят по одному в XP-бар → бар растёт → блок награды
// схлопывается → onDone. Шариков столько же, сколько XP, но не больше десяти (xpTransferPlan.js: получил 3 —
// три шарика, 50 — десять, по 5 XP каждый): отлёт шарика уменьшает счётчик на его долю,
// прилёт добавляет долю в полоску. Общий компонент — используется в итогах урока (LessonSummary), итоге
// повторения (ReviewSummary) и в попапе забора награды стрика (RewardClaimPopup): правило одно на все.
// CSS-классы summaryXpTransfer* / summaryRewardBlock* / summaryXpBar* — глобальные, лежат в src/styles/xp.css.
const PARTICLE_FLY = 520    // ms each dot takes to fly
const START_MS     = 200    // пауза до первого вылета
const BAR_STEP_MS  = 360    // полоска доезжает до новой отметки за это время после прилёта шарика

export default function XpTransfer({ earnedXp, baseXp, onDone, label = 'Награда за урок' }) {
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

  // Bar width as React state — меняется ступенями, по одному разу на прилёт шарика; CSS transition доезжает
  const [barPct, setBarPct] = useState(initPct)

  const numRef      = useRef(null)
  const xpNumRef    = useRef(null)
  const barBgRef    = useRef(null)
  const barFillRef  = useRef(null)
  const rewardRef   = useRef(null)   // label + number wrapper
  const canvasRef   = useRef(null)
  const wrapRef     = useRef(null)

  useEffect(() => {
    if (!earnedXp) onDone?.()
  }, []) // eslint-disable-line

  // rAF loop: счётчик, шарики и полоска идут по плану (xpTransferPlan.js)
  useEffect(() => {
    if (!earnedXp) return
    // Первый шарик прилетит через ~0,7 с: греем xp-gain заранее, чтобы его звук не опаздывал на iOS (sounds.js)
    warmSound('xp-gain')
    const shares = particleShares(earnedXp)
    const gap = departGap(shares.length)
    // Шарик: когда вылетает, сколько XP уносит и до какой отметки полоски доедет после прилёта
    let cum = 0
    const plan = shares.map((share, i) => {
      cum += share
      return { at: START_MS + i * gap, share, pct: initPct + (finalPct - initPct) * (cum / earnedXp), arrived: false }
    })
    const endAt = plan[plan.length - 1].at + PARTICLE_FLY
    const startTime = performance.now()
    let shownNum = earnedXp
    let shownTotal = baseXp
    let raf

    function tick(now) {
      const elapsed = now - startTime
      let departedXp = 0
      let arrivedXp = 0
      for (const p of plan) {
        if (elapsed >= p.at) departedXp += p.share
        if (elapsed >= p.at + PARTICLE_FLY) {
          arrivedXp += p.share
          if (!p.arrived) { p.arrived = true; setBarPct(p.pct); playSound('xp-gain', 'XP: прилёт шарика') }
        }
      }

      // Direct DOM: число — остаток награды (только цифры: шарики стартуют из центра цифр), маленький
      // счётчик — XP игрока с учётом прилетевшего; пишем, только когда значение сменилось
      const curXp = earnedXp - departedXp
      if (numRef.current && curXp !== shownNum) { numRef.current.textContent = curXp; shownNum = curXp }
      if (xpNumRef.current && baseXp + arrivedXp !== shownTotal) { shownTotal = baseXp + arrivedXp; xpNumRef.current.textContent = shownTotal + ' XP' }

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
        const cw = Math.round(wr.width + BLEED * 2)
        const ch = Math.round(wr.height + BLEED * 2)
        if (canvas.width !== cw) canvas.width = cw // смена размера сбрасывает холст — только если он изменился
        if (canvas.height !== ch) canvas.height = ch
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const nr = numEl.getBoundingClientRect()
        const sx = nr.left - wr.left + BLEED + nr.width  / 2
        const sy = nr.top  - wr.top  + BLEED + nr.height / 2

        const br = barBg.getBoundingClientRect()
        const ty = br.top  - wr.top  + BLEED + br.height / 2

        for (const p of plan) {
          const pt = (elapsed - p.at) / PARTICLE_FLY
          if (pt < 0 || pt >= 1) continue
          // летит к отметке, до которой полоска доедет после этого шарика
          const tx = br.left - wr.left + BLEED + br.width * (p.pct / 100)
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
      }

      if (elapsed < endAt) {
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
          setTimeout(() => {
            // Новый уровень — звук ровно к появлению блока уровня (его показывает
            // onDone; один компонент на итоги урока, повторения и награду серии)
            if (finalLevel.level > startLevel.level) playSound('level-up', 'новый уровень')
            onDone?.()
          }, 950)
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
        <div className="summaryRewardLabel">{label}</div>
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
            style={{ width: barPct + '%', transition: barPct === initPct ? 'none' : `width ${BAR_STEP_MS}ms ease-out` }}
          />
        </div>
        <div className="summaryXpNumbers">
          <span ref={xpNumRef}>{baseXp} XP</span>
        </div>
      </div>
    </div>
  )
}
