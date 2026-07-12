// Вертикальный путь дней окна наград: первый показанный день — тот, что
// можно забрать прямо сейчас (current), дальше — будущие дни (locked).
// Веха (day_number из streak_milestones) рисуется крупной карточкой с
// золотым свечением, независимо от locked/current. Между нодами —
// соединительная линия: зелёная, если вход в следующий день уже совершён
// (day <= current_streak), иначе серая.
export default function RewardsPath({ days }) {
  return (
    <div className="rwPath">
      <div className="rwPathList">
        {days.map((d, i) => (
          <div key={d.day} className="rwPathRow">
            {i > 0 && <div className={d.visited ? 'rwConnector rwConnectorGreen' : 'rwConnector rwConnectorGray'} />}
            {d.milestone ? (
              <div className="rwNode rwNodeMilestone" data-current={d.status === 'current' || undefined}>
                <span className="rwNodeIcon">🎫</span>
                <p className="rwNodeDay">День {d.day}</p>
                <p className="rwNodeReward">
                  {d.xp > 0 && `${d.xp} XP`}
                  {d.xp > 0 && d.tickets > 0 && ' · '}
                  {d.tickets > 0 && `${d.tickets} 🎟`}
                </p>
              </div>
            ) : (
              <div className={`rwNode rwNode${d.status === 'current' ? 'Current' : 'Locked'}`}>
                {d.status === 'locked' && <span className="rwNodeLock">🔒</span>}
                <p className="rwNodeDay">День {d.day}</p>
                <p className="rwNodeReward">+{d.xp} XP</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
