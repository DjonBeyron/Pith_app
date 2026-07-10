// Попап «Поздравляем — доступна еженедельная супергонка»: показывается раз
// в неделю после первого пройденного модуля (условия проверяет RaceGlobalPopups).
export default function RaceAnnouncePopup({ race, onOpenRace, onClose }) {
  return (
    <div className="racePopupOverlay" onClick={onClose}>
      <div className="racePopupCard" onClick={e => e.stopPropagation()}>
        <div className="racePopupEmoji">🏆</div>
        <h3 className="racePopupTitle">Поздравляем!</h3>
        <p className="racePopupText">
          Тебе доступна еженедельная супергонка
          {race?.title ? <> — <b>«{race.title}»</b></> : null}.
          Пройди задания недели, открой гонку и поборись за медаль в выходные!
        </p>
        <button className="racePopupBtn" onClick={onOpenRace}>Узнать подробнее</button>
        <button className="racePopupClose" onClick={onClose}>Позже</button>
      </div>
    </div>
  )
}
