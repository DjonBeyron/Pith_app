import { useEffect } from 'react'
import { Snowflake, ShieldCheck, Crown } from 'lucide-react'
import TicketIcon from '../../shared/ui/TicketIcon.jsx'
import { weekKey } from '../race/useRaceState.js'
import { FREEZE_COST, AUTO_COST } from './useFreezeBuy.js'

const HINT_WEEK_KEY   = 'pithy_streak_guard_hint_week' // «серия не защищена» — раз в неделю
const HINT_FROM_STREAK = 5                             // короткую серию терять не жалко

// Строка состояния защит под счётчиком серии: ровно одна строка и максимум
// одна кнопка. Приоритет тот же, в каком защиты срабатывают на сервере
// (PRO → заморозка → авто-заморозка), поэтому пользователь видит именно то,
// что спасёт его следующим.
function build({ state, res, hintAllowed }) {
  const pro   = !!res.is_pro
  const froze = !!res.has_freeze_charge
  const auto  = res.auto_freeze_charges_left ?? 0

  if (state === 'saved') {
    if (res.saved_by === 'pro_weekend') {
      return { icon: Crown, text: 'PRO простил выходные' }
    }
    if (res.saved_by === 'pro_weekday') {
      return {
        icon: Crown,
        text: 'PRO простил будний день',
        note: 'На этой неделе — больше не простит',
        cta: froze ? null : { kind: 'freeze', label: 'Подстраховаться', cost: FREEZE_COST },
      }
    }
    if (res.saved_by === 'freeze') {
      return {
        icon: Snowflake,
        text: 'Заморозка спасла серию',
        cta: { kind: 'freeze', label: 'Купить ещё', cost: FREEZE_COST },
      }
    }
    return {
      icon: ShieldCheck,
      text: auto > 0 ? `Авто-защита спасла серию · осталось ${auto}` : 'Авто-защита спасла серию и кончилась',
      cta: auto > 0 || pro ? null : { kind: 'auto', label: 'Купить ещё', cost: AUTO_COST },
    }
  }

  if (state === 'reset') {
    // Один CTA, выбранный по причине срыва. Пропуск в 3+ дней не спасла бы
    // ни одна защита — предлагать её в этот момент было бы обманом.
    if (res.missed_weekend_only && !pro) {
      return { icon: Crown, text: 'PRO прощает выходные', cta: { kind: 'pro', label: 'Про PRO' } }
    }
    if (res.missed_days === 1 && !froze) {
      return { icon: Snowflake, text: 'Заморозка бы спасла', cta: { kind: 'freeze', label: 'Взять', cost: FREEZE_COST } }
    }
    return null
  }

  // Обычное утро.
  if (pro) {
    return {
      icon: Crown,
      text: 'PRO: выходные и 1 будний в неделю',
      note: res.pro_weekday_used ? 'Будний на этой неделе уже потрачен' : null,
    }
  }
  if (froze) return { icon: Snowflake, text: 'Заморозка готова' }
  if (auto > 0) return { icon: ShieldCheck, text: `Авто-защита: осталось ${auto}` }
  if (hintAllowed) {
    return { icon: Snowflake, text: 'Серия не защищена', cta: { kind: 'freeze', label: 'Защитить', cost: FREEZE_COST } }
  }
  return null
}

export default function StreakGuardRow({ state, res, profile, onOpenSheet, onWantPro }) {
  const streak = res?.streak ?? 0
  const week = weekKey()
  const hintAllowed = state === 'grown' && streak >= HINT_FROM_STREAK
    && localStorage.getItem(HINT_WEEK_KEY) !== week

  const row = res ? build({ state, res, hintAllowed }) : null
  const shownHint = !!row && hintAllowed

  useEffect(() => {
    if (shownHint) localStorage.setItem(HINT_WEEK_KEY, week)
  }, [shownHint, week])

  if (!row) return null
  const Icon = row.icon
  const cost = row.cta?.cost ?? 0
  const enough = !cost || (profile?.tickets ?? 0) >= cost

  function act() {
    if (!row.cta) return
    if (row.cta.kind === 'pro') onWantPro?.()
    else onOpenSheet?.(row.cta.kind === 'freeze' ? 'freeze' : 'auto')
  }

  return (
    <div className={row.cta ? 'sgGuard sgGuardTap' : 'sgGuard'} onClick={row.cta ? act : undefined}>
      <Icon className="sgGuardIcon" size={16} />
      <span className="sgGuardBody">
        <span className="sgGuardText">{row.text}</span>
        {row.note && <span className="sgGuardNote">{row.note}</span>}
      </span>
      {row.cta && (
        <button className="sgGuardBtn" onClick={e => { e.stopPropagation(); act() }}>
          {!enough ? <>Нужно {cost} <TicketIcon className="sgGuardBtnIcon" /></>
            : cost > 0 ? <>{row.cta.label} · {cost} <TicketIcon className="sgGuardBtnIcon" /></>
              : row.cta.label}
        </button>
      )}
    </div>
  )
}
