import { useEffect, useState } from 'react'
import { summaryLine } from './reviewTeacher.js'
import { requestOpenModule } from '../../shared/lib/openModuleEvent.js'
import ReviewWordBar from './ReviewWordBar.jsx'
import XpTransfer from '../../shared/ui/XpTransfer.jsx'
import Confetti from '../../shared/ui/Confetti.jsx'

// Итог сессии повторения — в стиле итога урока (LessonSummary): тёмная подложка с размытием,
// карточка, заголовок мелкими буквами, перенос награды в XP-полоску уровня, зелёная «Готово».
// Сверху конфетти — поздравление: повторение завершено. Оно сыплется, пока идут анимации итога
// (полоски слов, перенос XP), и плавно затихает. В карточке — строка учителя из
// данных и полоска каждого слова, которая на глазах пополняется (ReviewWordBar): слова идут
// по одному, медленно, чтобы рост можно было разглядеть. Ниже награда (XpTransfer, если XP
// начислен — без «+N XP» текстом), день серии одной строкой (место под неё занято заранее —
// окно не растёт), серый мостик «Продолжить изучение фразы…» в недопройденный модуль
// (reviewBridge.js). Слова, которые давались непросто,
// подаются с заботой — «вернёмся завтра», без «ошибок». Усвоенное слово,
// вспомненное на месячной проверке, уходит в постоянную память — празднуем
// фиолетовой строкой (settled — ответ memory_review_word). memory — память слов
// до сессии: оттуда прежний шаг для полоски; baseXp — XP до награды.
const TONE = { good: 'ok', hard: 'mid', again: 'soft', fail: 'soft' }
const FIRST_MS = 700   // первая полоска начинает расти, когда карточка уже проявилась
const STAGGER_MS = 1000 // следующая — через столько после предыдущей (не более MAX_STAGGER шагов)
const MAX_STAGGER = 5
const MIN_CONFETTI_MS = 3500 // салют идёт не меньше — даже если анимировать почти нечего

// День серии (memory_finish_session): одна короткая строка. XP текстом не пишем — его показывает
// перенос награды в полоску уровня
function streakText(finish) {
  if (!finish?.ok) return null
  if (finish.streak?.incremented) return `🔥 день серии засчитан (${finish.streak.streak})`
  if (finish.streak?.reason === 'already_today') return 'серия на сегодня уже засчитана'
  return null
}

export default function ReviewSummary({ results, finish, bridge, phrase = null, words, memory = [], baseXp = 0, onClose, onRequireAuth }) {
  const [visible, setVisible] = useState(false)
  const [xpDone, setXpDone] = useState(false)
  const [barsDone, setBarsDone] = useState(0)
  const [minDone, setMinDone] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    const min = setTimeout(() => setMinDone(true), MIN_CONFETTI_MS)
    return () => { cancelAnimationFrame(id); clearTimeout(min) }
  }, [])

  const order = new Map(words.map((w, i) => [w, i]))
  const rows = [...results].sort((a, b) => (order.get(a.word) ?? 99) - (order.get(b.word) ?? 99))
  const before = new Map(memory.map(m => [m.word, m.step]))
  const earned = finish?.ok && finish.xp > 0 ? finish.xp : 0
  const streak = streakText(finish)
  // Салют идёт, пока идут анимации: полоски слов, перенос XP; потом подсыпка прекращается и он затихает
  const animating = !(minDone && barsDone >= rows.length && (xpDone || !earned))
  const settled = rows.filter(r => r.settled).map(r => `«${r.word}»`)
  // Ушедшие в постоянную память в строке учителя не повторяем — у них своя строка
  const lineRows = rows.filter(r => !r.settled)
  return (
    <>
      <Confetti count={140} active={animating} />
      <div className={`lessonSummaryOverlay reviewSummary${visible ? ' lessonSummaryOverlayVisible' : ''}`} role="dialog" aria-label="Итог повторения">
        <div className="lessonSummaryCard reviewSumCard">
          <div className="summaryTitle reviewSummaryTitle">Повторение завершено</div>

          {rows.length > 0 && (
            <div className="reviewSumWords">
              {lineRows.length > 0 && <p className="reviewTeacherLine">{summaryLine(lineRows)}</p>}
              <ul className="reviewWords">
                {rows.map((r, i) => (
                  <li key={r.word} className={`reviewWord reviewWord--${TONE[r.outcome] ?? 'mid'}`}>
                    <ReviewWordBar word={r.word} from={before.get(r.word) ?? r.step} to={r.step} settled={r.settled}
                      delay={FIRST_MS + Math.min(i, MAX_STAGGER) * STAGGER_MS} onDone={() => setBarsDone(n => n + 1)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {phrase && (
            <p className={phrase.ok ? 'reviewPhraseResult reviewPhraseResultOk' : 'reviewPhraseResult'}>
              {phrase.ok ? `✨ Фраза «${phrase.title}» закреплена` : `Фраза «${phrase.title}» вернётся в другой раз`}
            </p>
          )}
          {settled.length > 0 && (
            <p className="reviewPhraseResult reviewSettled">
              ✨ {settled.join(', ')} {settled.length === 1 ? 'ушло' : 'ушли'} в постоянную память
            </p>
          )}

          {earned > 0 && <XpTransfer baseXp={baseXp} earnedXp={earned} label="Награда за повторение" onDone={() => setXpDone(true)} />}
          {streak && <p className={'reviewReward' + (xpDone || !earned ? ' reviewReward--on' : '')}>{streak}</p>}

          {finish?.guest && (
            <div className="reviewGuest">
              <p className="reviewGuestLead">Войди — сохраним прогресс и напомним завтра</p>
              {onRequireAuth && <button className="lrBtn reviewBtnGuest" onClick={onRequireAuth}>Войти</button>}
            </div>
          )}
          <div className="reviewSumFoot">
            {bridge && (
              <button className="reviewBridge" onClick={() => { onClose(); requestOpenModule(bridge) }}>
                <span className="reviewBridgeMain">Продолжить изучение фразы «{bridge.title}»</span>
                <span className="reviewBridgeSub">Пройдено {bridge.pct}% — можно вернуться в любой момент</span>
              </button>
            )}
            <button className="summaryCloseBtn" onClick={onClose}>Готово</button>
          </div>
        </div>
      </div>
    </>
  )
}
