import { useRaceState } from './useRaceState.js'

const PHASE_SUB = {
  upcoming: 'Готовься — старт в субботу',
  running:  'Идёт прямо сейчас!',
  ended:    'Завершена — смотри итоги',
}

// Баннер супергонки вверху вкладки «Рейтинг» (по макету): кубок слева,
// чип «Супергонка недели», крупная тема, статус с точкой и полоса
// подготовки. Тап открывает страницу гонки.
export default function RaceBanner({ active = true, onOpen }) {
  const { race, phase, modules, earnedXp, totalXp } = useRaceState(active)
  if (!race) return null

  const doneCount = modules.filter(m => m.done).length
  const pct = totalXp > 0 ? Math.min(100, Math.round((earnedXp / totalXp) * 100)) : 0

  return (
    <button className="raceBanner raceBannerV2" onClick={onOpen}>
      {/* Кубок: public/rating/cup.svg (файл можно заменить своим) */}
      <img className="raceBannerCup" src="/rating/cup.svg" alt="" />
      <span className="raceBannerBody">
        <span className="raceBannerKicker">Супергонка недели</span>
        <span className="raceBannerTitle">{race.title || 'Тема недели'}</span>
        <span className="raceBannerStatus">
          <i className={phase === 'running' ? 'raceBannerDot raceBannerDotLive' : 'raceBannerDot'} />
          {PHASE_SUB[phase] ?? ''}
          <span className="raceBannerArrow">→</span>
        </span>
        {modules.length > 0 && phase !== 'ended' && (
          <span className="raceBannerPrep">
            Подготовка {doneCount}/{modules.length} · {earnedXp}/{totalXp} XP
            <i className="raceBannerBar"><i style={{ width: `${pct}%` }} /></i>
          </span>
        )}
      </span>
    </button>
  )
}
