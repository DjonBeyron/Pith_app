function fmtTime(ms) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} мин ${s % 60} сек` : `${s} сек`
}

// Итоги супер-урока гонки (вместо обычного экрана XP): время, ошибки и
// ВРЕМЕННОЕ место среди уже финишировавших — с оговоркой, что до конца
// гонки могут обогнать. XP и финальные места — в понедельник.
export default function RaceSummary({ errors, timeMs, rank, onClose }) {
  return (
    <div className="racePopupOverlay">
      <div className="racePopupCard">
        <div className="racePopupEmoji">🏁</div>
        <h3 className="racePopupTitle">Супер-урок пройден!</h3>

        <div className="raceSumRows">
          <div className="raceSumRow"><span>Время</span><b>{fmtTime(timeMs)}</b></div>
          <div className="raceSumRow"><span>Ошибок</span><b>{errors}</b></div>
          {rank?.rank && (
            <div className="raceSumRow raceSumRowRank">
              <span>Пока ты</span><b>№{rank.rank} из {rank.total}</b>
            </div>
          )}
        </div>

        <p className="racePopupText">
          Это место — среди уже финишировавших: до конца гонки тебя ещё могут
          обогнать. Финальные места и XP за супер-урок — в понедельник.
        </p>

        <button className="racePopupBtn" onClick={onClose}>Понятно</button>
      </div>
    </div>
  )
}
