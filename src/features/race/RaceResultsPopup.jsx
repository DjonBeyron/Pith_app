import UserBadge from '../../shared/ui/UserBadge.jsx'

// Попап итогов супергонки: подиум 1-2-3; если пользователь не в тройке —
// его строка чуть ниже с отступом. Показывается участникам после окончания.
export default function RaceResultsPopup({ race, results, myUserId, onClose }) {
  const top3 = results.filter(r => r.place <= 3)
  const me   = results.find(r => r.user_id === myUserId) ?? null
  const meBelow = me && me.place > 3

  const row = (r) => (
    <div key={r.user_id} className={`racePodiumRow${r.user_id === myUserId ? ' racePodiumRowMe' : ''}`}>
      <span className="ratingPlace" data-place={r.place <= 3 ? r.place : undefined}>{r.place}</span>
      <UserBadge
        nickname={r.nickname || 'Без имени'}
        userId={r.user_id}
        cosmetics={r.cosmetics ?? {}}
        medalPlace={r.medal_place}
        size={34}
      />
      <span className="ratingXp">{r.score}</span>
    </div>
  )

  return (
    <div className="racePopupOverlay" onClick={onClose}>
      <div className="racePopupCard" onClick={e => e.stopPropagation()}>
        <div className="racePopupEmoji">🏁</div>
        <h3 className="racePopupTitle">Итоги супергонки</h3>
        {race?.title && <p className="racePopupText">«{race.title}»</p>}

        <div className="racePodium">
          {top3.map(row)}
          {top3.length === 0 && <div className="pvEmpty">Никто не финишировал</div>}
          {meBelow && (
            <>
              <div className="racePodiumGap">···</div>
              {row(me)}
            </>
          )}
        </div>

        <button className="racePopupBtn" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}
