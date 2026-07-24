import { useEffect, useRef } from 'react'

// Фиксированный набор дней для скелетона (ghost=true): пока вехи (milestones)
// не пришли с сервера, реальный статус дней посчитать нельзя — рисуем
// правдоподобный путь той же формы (4 обычные ноды + 1 крупная веха, зелёные
// и серые коннекторы), чтобы блестели силуэты настоящих .rwNode/.rwConnector,
// а не отдельная скелетон-разметка.
const GHOST_DAYS = [
  { day: 1, xp: 5,  tickets: 0, milestone: false, status: 'done',   visited: true },
  { day: 2, xp: 5,  tickets: 0, milestone: false, status: 'done',   visited: true },
  { day: 3, xp: 20, tickets: 1, milestone: true,  status: 'ready',  visited: true },
  { day: 4, xp: 5,  tickets: 0, milestone: false, status: 'ready',  visited: true },
  { day: 5, xp: 5,  tickets: 0, milestone: false, status: 'locked', visited: false },
]

// Вертикальный путь дней окна наград: окно начинается с
// max(1, nextClaimDay - 3), поэтому сверху видны до 3 уже забранных дней.
// Статус каждого дня (см. расчёт в RewardsPopup):
//   'done'   — day < nextClaimDay: награда уже забрана — серая обесцвеченная
//              карточка со крупной полупрозрачной галочкой-штампом на весь блок
//   'ready'  — nextClaimDay <= day <= current_streak: день уже прожит и
//              ждёт забора — зелёная подсветка + иконка подарка в углу (может
//              быть несколько ready-дней сразу, если пользователь не заходил
//              забирать несколько дней подряд)
//   'locked' — day > current_streak: день ещё не наступил (🔒)
// Веха (day_number из streak_milestones) рисуется крупной карточкой с
// золотым свечением поверх того же статуса: 'done' — приглушена
// (rwNodeMilestoneDone), 'ready' — усиленное свечение (data-current).
// Между нодами — соединительная линия: зелёная, если вход в следующий день
// уже совершён (day <= current_streak), иначе серая.
//
// focusDay: день, к которому путь автоматически скроллится при открытии
// (без плавности — иначе список «прыгает» на глазах). Обычно это
// current_streak; если его нет в окне — последний ready-день (см. расчёт
// в RewardsPopup), либо null — тогда путь остаётся в исходной позиции.
export default function RewardsPath({ days, focusDay, ghost = false }) {
  const nodeRefs = useRef({})
  const rows = ghost ? GHOST_DAYS : days

  useEffect(() => {
    if (ghost) return // скелетон никуда не скроллим — ждём реальные данные
    const target = focusDay != null ? nodeRefs.current[focusDay] : null
    target?.scrollIntoView({ block: 'center' })
    // Скроллим только один раз, сразу после того как путь впервые
    // отрисовался с реальными данными (родитель форсирует новый mount при
    // переходе скелетон → контент через key, см. RewardsPopup).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`rwPath${ghost ? ' rwGhost' : ''}`}>
      <div className="rwPathList">
        {rows.map((d, i) => (
          <div
            key={d.day}
            className="rwPathRow"
            ref={el => { if (el) nodeRefs.current[d.day] = el }}
          >
            {i > 0 && <div className={d.visited ? 'rwConnector rwConnectorGreen' : 'rwConnector rwConnectorGray'} />}
            {d.milestone ? (
              <div
                className={`rwNode rwNodeMilestone${d.status === 'done' ? ' rwNodeMilestoneDone' : ''}`}
                data-current={d.status === 'ready' || undefined}
              >
                <span className="rwNodeIcon">🎫</span>
                <p className="rwNodeDay">День {d.day}</p>
                <p className="rwNodeReward">
                  {d.xp > 0 && `${d.xp} XP`}
                  {d.xp > 0 && d.tickets > 0 && ' · '}
                  {d.tickets > 0 && `${d.tickets} 🎟`}
                </p>
              </div>
            ) : (
              <div className={`rwNode rwNode${d.status === 'ready' ? 'Current' : d.status === 'done' ? 'Done' : 'Locked'}`}>
                {d.status === 'locked' && <span className="rwNodeLock">🔒</span>}
                {d.status === 'done' && (
                  <svg className="rwNodeDoneMark" viewBox="0 0 24 24" fill="none" stroke="#b6fe3b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {d.status === 'ready' && <span className="rwNodeGift" aria-hidden="true">🎁</span>}
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
