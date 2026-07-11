import { useState, useEffect } from 'react'
import { useRatingData } from './useRatingData.js'
import RaceBanner from '../race/RaceBanner.jsx'
import RacePage from '../race/RacePage.jsx'
import UserBadge from '../../shared/ui/UserBadge.jsx'
import { getCurrentLevel } from '../../shared/lib/xpLevels.js'

// Вкладка «Рейтинг»: баннер супергонки и глобальный топ по XP за всё время.
// Достижения и примерка косметики живут в Профиле → «Кастомизация».
export default function RatingTab({ openRaceTick = 0 }) {
  const [showRace, setShowRace] = useState(false)
  // Вкладка смонтирована всегда (см. ShellV2) — грузим данные сразу при
  // старте приложения, не дожидаясь клика по табу, чтобы переход был
  // мгновенным и без дёрганья вёрстки
  const { rows, myRank, achievements, cosmetics, profile, loading, myId } =
    useRatingData(!showRace)

  // Сигнал извне (попап-анонс): открыть страницу гонки
  useEffect(() => { if (openRaceTick > 0) setShowRace(true) }, [openRaceTick])

  if (showRace) {
    return <RacePage onBack={() => setShowRace(false)} />
  }

  const inTop = myId && rows.some(r => r.user_id === myId)

  return (
    <div className="ratingWrap">
      <RaceBanner onOpen={() => setShowRace(true)} />

      {/* Плашка-заголовок (по макету): лаймовый бар с иконкой и штрихами */}
      <div className="ratingHead">
        <svg className="ratingHeadIcon" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="6" width="4" height="14" rx="1" />
          <rect x="16" y="10" width="4" height="10" rx="1" />
        </svg>
        Рейтинг игроков
      </div>

      {/* Баннер и заголовок закреплены — скроллится только список */}
      <div className="ratingScroll">
        {loading ? (
          <div className="ratingList">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="ratingRow ratingRowSkeleton" />)}
          </div>
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
                    avatarSeed={r.avatar_seed}
                    cosmetics={r.cosmetics ?? {}}
                    medalPlace={r.medal_place}
                    wreathPlace={place <= 3 ? place : null}
                    size={place <= 3 ? 44 : 38}
                    pro={!!r.is_pro}
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
                    avatarSeed={profile?.avatar_seed}
                    cosmetics={cosmetics}
                    medalPlace={achievements.find(a => a.kind === 'race_winner')?.meta?.place ?? null}
                    size={38}
                    pro={!!(profile?.has_subscription || profile?.is_admin)}
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
