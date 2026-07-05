import { useState, useEffect, useRef } from 'react'

// Контур пятиугольника — тот же path, что в clip-path (lessons.css).
const FINAL_PATH = 'M 17.4 154.0 L 28.6 78.4 A 43.8 43.8 0 0 1 72.0 40.6 L 198.0 40.6 A 43.8 43.8 0 0 1 241.8 78.4 L 252.6 154.0 A 43.8 43.8 0 0 1 232.0 197.4 L 158.2 242.8 A 43.8 43.8 0 0 1 112.0 242.8 L 38.2 197.4 A 43.8 43.8 0 0 1 17.4 154.0 Z'

// Направления разлёта искр от замка (8 лучей по кругу).
const SPARK_DIRS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  return { '--dx': `${Math.round(Math.cos(a) * 46)}px`, '--dy': `${Math.round(Math.sin(a) * 46)}px` }
})

// Замок залитый цветом: сплошной корпус, скважина-прорезь, дужка штрихом.
// open — та же дужка, сдвинута вправо: её левая нога в корпусе у правого
// края, дуга и свободный конец висят в воздухе справа (как 🔓 в референсе).
// overflow visible: открытая дужка выходит за viewBox справа — не режем её.
// Экспорт: ModuleGraph рисует этот же замок на уроках до прохождения диагностики.
export function LockIcon({ open, size = 23 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ overflow: 'visible' }}>
      {/* Корпус сдвинут влево под открытую дужку — закрытый рисунок для
          центровки в кружках/пилюле сдвигаем обратно вправо */}
      <g transform={open ? undefined : 'translate(2.25 0)'}>
        <path d={open ? 'M12 11 V6.5 a4.5 4.5 0 0 1 9 0 v1.6' : 'M6.6 11 V7.2 a3.2 3.2 0 0 1 6.4 0 V11'}
          fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        <rect x="3.5" y="10.2" width="12.5" height="10.3" rx="2.6" fill="currentColor" />
        <circle cx="9.75" cy="14.4" r="1.6" fill="#120f1a" />
        <rect x="9" y="15.2" width="1.5" height="2.8" rx="0.75" fill="#120f1a" />
      </g>
    </svg>
  )
}

// Классический ключ-бегунок прогресс-бара: круглая головка, стержень, две бородки.
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="12" r="3.2" />
      <path d="M10.2 12 H21" />
      <path d="M17.5 12 v3" />
      <path d="M21 12 v3.6" />
    </svg>
  )
}

// Нод «Финал»: фиолетовый пятиугольник с замком и XP-прогрессом.
// Держит церемонию открытия: замок приближается, трясётся 4 раза,
// открывается со вспышкой deep-glow и неоновой обводкой, возвращается открытым.
export default function MgFinalNode({
  lesson, finalOpen, finalFlash, xpUnlock, earnedShow, xpPct,
  shine = false, // манящий блик: только после диагностики и пока финал закрыт
  renaming, renameInput, btns, nodeRef, knobRef, onHover, onClick, onPlay,
}) {
  const [unlockAnim,    setUnlockAnim]    = useState(false)
  const [burst,         setBurst]         = useState(false)
  const [lockOpenShown, setLockOpenShown] = useState(finalOpen)
  // Финал открыт и церемония отыграла: замок-цель у бара исчезает, а в пилюле
  // вместо замка появляется кнопка ▶. При монтировании уже открытого — сразу true.
  const [chromeGone,    setChromeGone]    = useState(finalOpen)
  // Подсказка у замка-цели: наведение или тап — «нужен ключ»
  const [lockHint,      setLockHint]      = useState(false)
  const prevOpenRef = useRef(finalOpen)
  const hintTimer   = useRef(null)

  useEffect(() => () => clearTimeout(hintTimer.current), [])

  // Тап по замку: показать подсказку и спрятать через пару секунд
  // (stopPropagation — чтобы тап не запускал финальный урок)
  function pokeLock(e) {
    e.stopPropagation()
    if (finalOpen) return
    setLockHint(true)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setLockHint(false), 2200)
  }

  useEffect(() => {
    if (prevOpenRef.current === finalOpen) return
    prevOpenRef.current = finalOpen
    if (!finalOpen) {
      // Сброс прогресса — вернуть замок закрытым (асинхронно: правило хуков).
      const t = setTimeout(() => { setLockOpenShown(false); setChromeGone(false) }, 0)
      return () => clearTimeout(t)
    }
    const t0 = setTimeout(() => setUnlockAnim(true), 0)
    const t1 = setTimeout(() => { setLockOpenShown(true); setBurst(true) }, 1300)
    const t2 = setTimeout(() => setUnlockAnim(false), 2200)
    const t3 = setTimeout(() => setBurst(false), 3400)
    const t4 = setTimeout(() => setChromeGone(true), 3800) // церемония кончилась — прибрать
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [finalOpen])

  const glowCls = `mgGlow ${finalOpen ? 'mgGlow--final--open' : 'mgGlow--final'}` +
    (finalFlash ? ' mgGlow--finalFlash' : '') + (burst ? ' mgGlow--finalBurst' : '') +
    (shine ? ' mgGlow--finalShine' : '')

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
              {/* У открытого финала заголовок сидит ниже — ближе к центру формы */}
              <span className={`mgNodeTitle${chromeGone ? ' mgFinalTitleOpen' : ''}`}>{lesson.title}</span>
              {chromeGone ? (
                /* Церемония отыграла: пилюля и бар исчезли — кнопка запуска
                   по центру формы, текст статуса на месте линии прогресса */
                <>
                  <button
                    className="mgFinalPlayBtn"
                    onClick={e => { e.stopPropagation(); onPlay?.(lesson.id) }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M8 5 L19 12 L8 19 Z" />
                    </svg>
                  </button>
                  <span className="mgFinalOpenText">Финальный урок открыт!</span>
                </>
              ) : (
              <>
              {/* Плашка-«пилюля»: замок церемонии + статус доступа */}
              <div className={`mgFinalPill${finalOpen ? ' mgFinalPill--open' : ''}`}>
                <span className={`mgFinalPillLock${unlockAnim ? ' mgIconBadge--unlocking' : ''}`}>
                  <LockIcon open={lockOpenShown} size={30} />
                  {burst && (
                    <span className="mgLockSparks">
                      {SPARK_DIRS.map((d, i) => (
                        <span key={i} className="mgLockSpark" style={d} />
                      ))}
                    </span>
                  )}
                </span>
                <span className="mgFinalPillText">
                  {finalOpen ? 'Финальный урок открыт!' : 'Доступ закрыт'}
                </span>
              </div>
              {xpUnlock > 0 && (
                <div className="mgFinalXpWrap">
                  {/* Ключ едет по бару к замку у правого края; при открытии замок
                      откинут. Цифры — под баром. */}
                  <div className="mgFinalXpBarRow">
                    <div className="mgFinalXpTrack">
                      <div className="mgFinalXpBar">
                        <div className="mgFinalXpBarFill" style={{ width: xpPct + '%' }} />
                      </div>
                      {/* Ключ исчезает сразу, как бар дошёл до конца (finalOpen),
                          не дожидаясь конца церемонии */}
                      <span ref={knobRef} className={`mgFinalXpKnob${finalOpen ? ' mgFinalXpKnob--gone' : ''}`}
                        style={{ left: xpPct + '%' }}>
                        <KeyIcon />
                      </span>
                    </div>
                    <span
                      className={`mgFinalXpLock${finalOpen ? ' mgFinalXpLock--open' : ''}`}
                      onMouseEnter={() => { if (!finalOpen) setLockHint(true) }}
                      onMouseLeave={() => setLockHint(false)}
                      onClick={pokeLock}
                    >
                      <LockIcon open />
                      {lockHint && (
                        <span className="mgFinalLockTip">Нужен ключ, чтобы открыть</span>
                      )}
                    </span>
                  </div>
                  <span className="mgFinalXpLabel">
                    <span className="mgFinalXpNow">{earnedShow}</span> / {xpUnlock} XP
                  </span>
                </div>
              )}
              </>
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
