import { useState, useEffect } from 'react'
import { useRatingData } from './useRatingData.js'
import RaceBanner from '../race/RaceBanner.jsx'
import RacePage from '../race/RacePage.jsx'
import UserBadge from '../../shared/ui/UserBadge.jsx'
import { getCurrentLevel } from '../../shared/lib/xpLevels.js'

// Вкладка «Рейтинг»: баннер супергонки и глобальный топ по XP за всё время.
// Достижения и примерка косметики живут в Профиле → «Кастомизация».
export default function RatingTab({ visible = true, openRaceTick = 0 }) {
  const [showRace, setShowRace] = useState(false)
  const { rows, myRank, achievements, cosmetics, profile, loading, myId } =
    useRatingData(visible && !showRace)

  // Сигнал извне (попап-анонс): открыть страницу гонки
  useEffect(() => { if (openRaceTick > 0) setShowRace(true) }, [openRaceTick])

  if (showRace) {
    return <RacePage onBack={() => setShowRace(false)} />
  }

  const inTop = myId && rows.some(r => r.user_id === myId)

  return (
    <div className="ratingWrap">
      <RaceBanner active={visible} onOpen={() => setShowRace(true)} />

      <div className="ratingTabs">
        <span className="ratingTab ratingTabActive">Рейтинг игроков</span>
      </div>

      {/* Баннер и заголовок закреплены — скроллится только список */}
      <div className="ratingScroll">
        {loading ? (
          <div className="ratingEmpty">Загрузка...</div>
        ) : rows.length === 0 ? (
          <div className="ratingEmpty">Пока пусто — проходи уроки и попади в топ первым</div>
        ) : (
          <div className="ratingList">
            {rows.map((r, i) => {
              const place = i + 1
              const lvl = getCurrentLevel(r.xp)
              return (
                <div key={r.user_id} className="ratingRow" data-place={place <= 3 ? place : undefined}>
                  <span className="ratingPlace" data-place={place <= 3 ? place : undefined}>{place}</span>
                  <UserBadge
                    nickname={r.nickname || 'Без имени'}
                    userId={r.user_id}
                    cosmetics={r.cosmetics ?? {}}
                    medalPlace={r.medal_place}
                    size={38}
                  />
                  <span className="ratingLevel">{lvl.level} ур</span>
                  <span className="ratingXp">{r.xp} XP</span>
                </div>
              )
            })}
            {/* Не в топе-100 — своя позиция ниже, без особого выделения */}
            {myId && !inTop && myRank?.rank && (
              <>
                <div className="ratingGap">···</div>
                <div className="ratingRow">
                  <span className="ratingPlace">{myRank.rank}</span>
                  <UserBadge
                    nickname={profile?.nickname || 'Ты'}
                    userId={myId}
                    cosmetics={cosmetics}
                    medalPlace={achievements.find(a => a.kind === 'race_winner')?.meta?.place ?? null}
                    size={38}
                  />
                  <span className="ratingLevel">{getCurrentLevel(profile?.xp ?? 0).level} ур</span>
                  <span className="ratingXp">{profile?.xp ?? 0} XP</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
