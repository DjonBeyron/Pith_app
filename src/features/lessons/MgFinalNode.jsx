import { useState, useEffect, useRef } from 'react'

// Контур пятиугольника — тот же path, что в clip-path (lessons.css).
const FINAL_PATH = 'M 17.4 154.0 L 28.6 78.4 A 43.8 43.8 0 0 1 72.0 40.6 L 198.0 40.6 A 43.8 43.8 0 0 1 241.8 78.4 L 252.6 154.0 A 43.8 43.8 0 0 1 232.0 197.4 L 158.2 242.8 A 43.8 43.8 0 0 1 112.0 242.8 L 38.2 197.4 A 43.8 43.8 0 0 1 17.4 154.0 Z'

// Направления разлёта искр от замка (8 лучей по кругу).
const SPARK_DIRS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  return { '--dx': `${Math.round(Math.cos(a) * 46)}px`, '--dy': `${Math.round(Math.sin(a) * 46)}px` }
})

// Замок: детальный — дужка, корпус, замочная скважина. open — дужка откинута.
function LockIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      {open
        ? <path d="M8 11 V7 a4 4 0 0 1 7.9 -0.8" />
        : <path d="M8 11 V7 a4 4 0 0 1 8 0 v4" />}
      <circle cx="12" cy="14.6" r="1.6" />
      <path d="M12 16.2 v1.7" />
    </svg>
  )
}

// Нод «Финал»: фиолетовый пятиугольник с замком и XP-прогрессом.
// Держит церемонию открытия: замок приближается, трясётся 4 раза,
// открывается со вспышкой deep-glow и неоновой обводкой, возвращается открытым.
export default function MgFinalNode({
  lesson, finalOpen, finalFlash, xpUnlock, earnedShow, xpPct,
  renaming, renameInput, btns, nodeRef, knobRef, onHover, onClick,
}) {
  const [unlockAnim,    setUnlockAnim]    = useState(false)
  const [burst,         setBurst]         = useState(false)
  const [lockOpenShown, setLockOpenShown] = useState(finalOpen)
  const prevOpenRef = useRef(finalOpen)

  useEffect(() => {
    if (prevOpenRef.current === finalOpen) return
    prevOpenRef.current = finalOpen
    if (!finalOpen) {
      // Сброс прогресса — вернуть замок закрытым (асинхронно: правило хуков).
      const t = setTimeout(() => setLockOpenShown(false), 0)
      return () => clearTimeout(t)
    }
    const t0 = setTimeout(() => setUnlockAnim(true), 0)
    const t1 = setTimeout(() => { setLockOpenShown(true); setBurst(true) }, 1300)
    const t2 = setTimeout(() => setUnlockAnim(false), 2200)
    const t3 = setTimeout(() => setBurst(false), 3400)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [finalOpen])

  const glowCls = `mgGlow ${finalOpen ? 'mgGlow--final--open' : 'mgGlow--final'}` +
    (finalFlash ? ' mgGlow--finalFlash' : '') + (burst ? ' mgGlow--finalBurst' : '')

  return (
    <div className={glowCls}>
      <div className="mgFinalHalo" />
      <div
        ref={nodeRef}
        className={`mgNode mgNode--final${finalOpen ? ' mgNode--final--open' : ''}`}
        onMouseEnter={() => onHover(lesson.id)}
        onMouseLeave={() => onHover(null)}
        onClick={e => { e.stopPropagation(); onClick(lesson.id) }}
      >
        <div className="mgHexFill mgHexFill--final">
          {renaming ? renameInput : (
            <>
              <span className={`mgIconBadge mgIconBadge--final${unlockAnim ? ' mgIconBadge--unlocking' : ''}`}>
                <LockIcon open={lockOpenShown} />
                {burst && (
                  <span className="mgLockSparks">
                    {SPARK_DIRS.map((d, i) => (
                      <span key={i} className="mgLockSpark" style={d} />
                    ))}
                  </span>
                )}
              </span>
              <span className="mgNodeTitle">{lesson.title}</span>
              <span className="mgFinalDesc">
                {finalOpen ? 'Финальный урок открыт!' : 'Завершите все уроки чтобы открыть'}
              </span>
              {xpUnlock > 0 && (
                <div className="mgFinalXpWrap">
                  <span className="mgFinalXpLabel">
                    <span className="mgFinalXpNow">{earnedShow}</span> / {xpUnlock} XP
                  </span>
                  <div className="mgFinalXpBarRow">
                    <div className="mgFinalXpBar">
                      <div className="mgFinalXpBarFill" style={{ width: xpPct + '%' }} />
                    </div>
                    <span ref={knobRef} className="mgFinalXpKnob" style={{ left: xpPct + '%' }}>★</span>
                  </div>
                </div>
              )}
              {btns}
            </>
          )}
        </div>
      </div>
      <svg className="mgNodeOutline" viewBox="0 0 270 270">
        <defs>
          <linearGradient id="mgOutlineFinal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0"    stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="0.55" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="1"    stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={FINAL_PATH} stroke="url(#mgOutlineFinal)" />
      </svg>
    </div>
  )
}
