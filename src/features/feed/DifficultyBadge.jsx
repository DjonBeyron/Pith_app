import { useState, useRef, useEffect } from 'react'

// Иконка сложности фразы (три полоски-«сигнал») = кнопка голосования.
// Тап → панель выезжает от кнопки (scale от 0, origin у кнопки). Один
// вопрос «Понял на слух?»: тап по варианту — мини-фейерверк искр на нём,
// потом панель закрывается и иконка морфится в зелёную галочку («Учтено»).
// Кнопка «?» — попап-пояснение; его закрытие (крестик или тап вне) НЕ
// закрывает саму панель (свой backdrop поверх панельного).
const LEVELS = [
  { v: 1, label: 'Легко',  cls: 'diffEasy' },
  { v: 2, label: 'Средне', cls: 'diffMid' },
  { v: 3, label: 'Сложно', cls: 'diffHard' },
]

const CONFIRM_MS = 1300 // сколько висит галочка «Учтено»
const BURST_MS   = 480  // сколько играют искры до закрытия панели

// 8 искр по кругу, чередуем два радиуса — «объёмный» разлёт
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  const r = i % 2 ? 12 : 17
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r }
})

export default function DifficultyBadge({ level, myVote, onVote }) {
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const [burst, setBurst] = useState(null) // уровень, на котором играют искры
  const [confirmed, setConfirmed] = useState(false)
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function closePanel() {
    setOpen(false)
    setHelp(false)
    setBurst(null)
  }

  function pick(v) {
    if (burst) return // искры уже играют — защита от двойного тапа
    // Гость: голос не учтён, его уводит на форму входа — без эффектов
    if (!onVote(v)) { closePanel(); return }
    setBurst(v)
    timers.current.push(setTimeout(() => {
      closePanel()
      setConfirmed(true)
      timers.current.push(setTimeout(() => setConfirmed(false), CONFIRM_MS))
    }, BURST_MS))
  }

  return (
    <div className="diffWrap">
      {open && <div className="diffBackdrop" onClick={closePanel} />}
      {open && (
        <div className="diffPanel">
          <div className="diffPanelHead">
            <span className="diffPanelTitle">Понял на слух?</span>
            <button className="diffHelpBtn" onClick={() => setHelp(true)}>?</button>
          </div>
          <div className="diffPanelRow">
            {LEVELS.map(l => (
              <button
                key={l.v}
                className={`diffOption ${l.cls}${myVote === l.v ? ' diffOptionOn' : ''}`}
                onClick={() => pick(l.v)}>
                <span className="diffDot" />
                {l.label}
                {burst === l.v && (
                  <span className="diffBurst">
                    {SPARKS.map((s, i) => (
                      <i key={i} style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px` }} />
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
          {help && (
            <>
              <div className="diffHelpBackdrop" onClick={() => setHelp(false)} />
              <div className="diffHelpPop">
                <button className="diffHelpClose" onClick={() => setHelp(false)}>✕</button>
                Оцени, насколько фраза сложна на слух, — иконка у видео покажет
                это другим ученикам ещё до просмотра. Голос можно изменить
                в любой момент.
              </div>
            </>
          )}
        </div>
      )}
      <button className="feedHudBtn" onClick={() => (open ? closePanel() : setOpen(true))}>
        <span className={`diffIcon${confirmed ? ' diffIconConfirm' : ''}`}>
          <span className={`diffBars${level ? ` diffL${level}` : ''}`}>
            <i /><i /><i />
          </span>
          <svg className="diffCheck" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12.5l5.5 5.5L20 6.5" />
          </svg>
        </span>
        <span>{confirmed ? 'Учтено' : level ? LEVELS[level - 1].label : 'Сложность'}</span>
      </button>
    </div>
  )
}
