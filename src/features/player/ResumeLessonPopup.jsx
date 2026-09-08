// Попап при повторном входе в незавершённый урок: «Продолжить (~X%) / Начать
// заново». pct — 0..100, уже посчитан и сохранён в чекпойнте (useLessonResume.js).
export default function ResumeLessonPopup({ pct, onResume, onRestart }) {
  const pctInt = Math.round(pct)
  return (
    <div className="resumeLessonOverlay">
      <div className="resumeLessonCard">
        <h2 className="resumeLessonTitle">Продолжить урок?</h2>
        <p className="resumeLessonSub">В прошлый раз ты дошёл примерно до {pctInt}%</p>
        <div className="resumeLessonBar">
          <div className="resumeLessonBarFill" style={{ width: `${pctInt}%` }} />
        </div>
        <button className="resumeLessonBtnPrimary" onClick={onResume}>Продолжить</button>
        <button className="resumeLessonBtnGhost" onClick={onRestart}>Начать заново</button>
      </div>
    </div>
  )
}
