import { useState, useRef, useEffect } from 'react'
import { X, Check } from 'lucide-react'
import { useHudPopupExit } from '../../app/hudPopupState.js'
import { useTapPop } from './useTapPop.js'

// Иконка сложности фразы (три полоски-«сигнал») = кнопка голосования.
// Тап → панель выезжает от кнопки (scale от 0, origin у кнопки). Один
// вопрос «Понял на слух?»: тап по варианту — мини-фейерверк искр на нём,
// потом панель закрывается и иконка морфится в зелёную галочку («Учтено»).
// Кнопка «?» — попап-пояснение; его закрытие (крестик или тап вне) НЕ
// закрывает саму панель (свой backdrop поверх панельного). При самом
// первом открытии панели попап показывается сам; пока он не закрыт —
// пульсирует иконка голосования и подсвечивается панель (не сам попап).
// Закрытие — обратная анимация к появлению, как у окошек худа сверху (useHudPopupExit): панель схлопывается к
// своей кнопке, поверх проступает заливка цвета панели (.diffPanel--out, hud-pop-out.css).
const LEVELS = [
  { v: 1, label: 'Легко',  cls: 'diffEasy' },
  { v: 2, label: 'Средне', cls: 'diffMid' },
  { v: 3, label: 'Сложно', cls: 'diffHard' },
]

const CONFIRM_MS = 1300 // сколько висит галочка «Учтено»
const BURST_MS   = 480  // сколько играют искры до закрытия панели
const HELP_SEEN_KEY = 'pithy_diff_help_seen_v1' // попап-интро уже закрывали

// 8 искр по кругу, чередуем два радиуса — «объёмный» разлёт
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  const r = i % 2 ? 12 : 17
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r }
})

export default function DifficultyBadge({ level, myVote, onVote, active = true }) {
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const [intro, setIntro] = useState(false) // авто-попап первого раза (пульсирует)
  const [burst, setBurst] = useState(null) // уровень, на котором играют искры
  const [confirmed, setConfirmed] = useState(false)
  const timers = useRef([])
  const [earPop, popEar] = useTapPop()
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const { shown, closing } = useHudPopupExit(open)

  // Свайп на другое видео и обратно: слайд не размонтируется (виртуализация
  // переиспользует DOM), поэтому без этого открытая панель голосования
  // «прилипала» и была видна при возврате
  useEffect(() => {
    if (!active && open) closePanel()
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  function openPanel() {
    setOpen(true)
    let seen = true
    try { seen = localStorage.getItem(HELP_SEEN_KEY) === '1' } catch { /* нет localStorage — без интро */ }
    if (!seen) { setHelp(true); setIntro(true) }
  }

  // Закрытие попапа (крестик/тап вне). Первое закрытие запоминаем —
  // авто-показ больше не повторится; пульсация гаснет вместе с попапом.
  function closeHelp() {
    setHelp(false)
    if (intro) {
      setIntro(false)
      try { localStorage.setItem(HELP_SEEN_KEY, '1') } catch { /* некритично */ }
    }
  }

  function closePanel() {
    setOpen(false)
    setBurst(null)
    closeHelp()
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
      {shown && (
        <div className={`${intro ? 'diffPanel diffPanelGlow' : 'diffPanel'}${closing ? ' diffPanel--out' : ''}`}>
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
              <div className="diffHelpBackdrop" onClick={closeHelp} />
              <div className="diffHelpPop">
                <button className="diffHelpClose" onClick={closeHelp}><X size={14} /></button>
                Оцени, насколько фраза сложна на слух, — иконка у видео покажет
                это другим ученикам ещё до просмотра. Голос можно изменить
                в любой момент.
              </div>
            </>
          )}
        </div>
      )}
      <button
        className={earPop ? 'feedHudBtn feedHudBtnPop feedHudBtnPopSelf' : 'feedHudBtn'}
        onClick={() => { popEar(); if (open) closePanel(); else openPanel() }}
        aria-label="Сложность фразы">
        <span className={`diffIcon${confirmed ? ' diffIconConfirm' : ''}${intro ? ' diffIconPulse' : ''}`}>
          {/* Ухо — силуэт (заливка), внутренняя завитушка — тёмная «вырезка»; lucide Ear — контур */}
          <svg className={`feedHudIcon diffEarIcon${level ? ` diffL${level}` : ''}`} viewBox="0 0 24 24" fill="currentColor"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0" />
            <path className="diffEarCut" d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4" />
          </svg>
          <Check className="diffCheck" strokeWidth={3} />
        </span>
      </button>
    </div>
  )
}
