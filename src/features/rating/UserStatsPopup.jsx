import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import UserBadge from '../../shared/ui/UserBadge.jsx'
import UserStatsBody from './UserStatsBody.jsx'
import { useUserStats } from './useUserStats.js'
import { useSwipeClose } from './useSwipeClose.js'
import { getCurrentLevel } from '../../shared/lib/xpLevels.js'
import { formatCount, podiumPlace } from '../../shared/lib/ratingStats.js'

// Попап игрока по тапу на строку «Рейтинга»: по центру экрана, сверху то же,
// что в строке (аватар/ник/место/уровень/XP/серия — берём из строки, они уже
// есть), ниже — подробности с сервера (UserStatsBody). Закрытие: тап вне
// окна, крестик, Esc, свайп вниз. Без blur — только затемнение и transform/opacity.
const OUT_MS = 170

export default function UserStatsPopup({ row, place, onClose }) {
  const [out, setOut] = useState(null) // null | 'tap' | 'swipe'
  const timer = useRef(0)
  const { res, retry } = useUserStats(row.user_id)

  const close = useCallback(kind => {
    if (out) return
    setOut(kind === 'swipe' ? 'swipe' : 'tap')
    timer.current = setTimeout(onClose, OUT_MS)
  }, [out, onClose])
  const [cardRef, swipeHandlers] = useSwipeClose(close)

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const lvl = getCurrentLevel(row.xp)
  const podium = podiumPlace(place)

  return createPortal(
    <div className={`rpBack${out ? ' rpBack--out' : ''}`} onClick={() => close()}>
      <div
        ref={cardRef}
        className={`rpCard${out === 'tap' ? ' rpCard--out' : ''}${out === 'swipe' ? ' rpCard--swiped' : ''}`}
        role="dialog" aria-modal="true" aria-label={`Игрок ${row.nickname || 'без имени'}`}
        onClick={e => e.stopPropagation()}
        {...swipeHandlers}
      >
        <span className="rpGrip" aria-hidden="true" />
        <button type="button" className="rpClose" aria-label="Закрыть" onClick={() => close()}>
          <X size={18} />
        </button>

        <div className="rpHead">
          <UserBadge
            nickname={row.nickname || 'Без имени'}
            userId={row.user_id}
            avatarSeed={row.avatar_seed}
            cosmetics={row.cosmetics ?? {}}
            medalPlace={row.medal_place}
            wreathPlace={podium}
            size={60}
            pro={!!row.is_pro}
          />
          <span className="rpPlace" data-place={podium ?? undefined}>{place} место</span>
        </div>

        <div className="rpChips">
          <span className="rpChip rpChip--lvl">Ур.{lvl.level} · {lvl.label}</span>
          <span className="rpChip">{formatCount(row.xp)} XP</span>
          {row.current_streak > 0 && (
            <span className="rpChip rpChip--streak"><Sparkles size={11} />{row.current_streak}</span>
          )}
        </div>

        <UserStatsBody res={res} retry={retry} />
      </div>
    </div>,
    document.body,
  )
}
