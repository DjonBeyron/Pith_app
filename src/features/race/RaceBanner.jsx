import { useRaceState } from './useRaceState.js'

const PHASE_SUB = {
  upcoming: 'Готовься — старт в субботу',
  running:  'Идёт прямо сейчас!',
  ended:    'Завершена — смотри итоги',
}

// Баннер супергонки вверху вкладки «Рейтинг»: тема, статус, прогресс
// подготовки по модулям. Тап открывает страницу гонки.
export default function RaceBanner({ active = true, onOpen }) {
  const { race, phase, modules, earnedXp, totalXp } = useRaceState(active)
  if (!race) return null

  const doneCount = modules.filter(m => m.done).length
  const prep = modules.length > 0 && phase !== 'ended'
    ? ` · подготовка ${doneCount}/${modules.length} (${earnedXp}/${totalXp} XP)`
    : ''

  return (
    <button className="raceBanner" onClick={onOpen}>
      <span className="raceBannerEmoji">🏆</span>
      <span className="raceBannerBody">
        <span className="raceBannerKicker">Супергонка недели</span>
        <span className="raceBannerTitle">{race.title || 'Тема недели'}</span>
        <span className="raceBannerSub">{PHASE_SUB[phase] ?? ''}{prep}</span>
      </span>
      <span className="raceBannerArrow">→</span>
    </button>
  )
}
