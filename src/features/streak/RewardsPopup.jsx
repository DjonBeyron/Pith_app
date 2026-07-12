import { useState, useEffect } from 'react'
import RewardsPath from './RewardsPath.jsx'
import {
  claimStreakReward, buyStreakFreeze, buyAutoFreeze, fetchStreakMilestones,
} from '../../shared/api/streakApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'

const WINDOW_SIZE = 7 // сколько дней вперёд рисуем в пути, если веха дальше

// Полноэкранное окно наград (по присланному макету): hero-прогресс до
// следующей вехи, путь дней, заморозки, кнопка «Забрать награду».
// Показывается вручную (блок в профиле) или один раз в день после урока
// (useStreakPopupTrigger.js).
export default function RewardsPopup({ profile, onClose, onWantPro }) {
  const [milestones, setMilestones] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [infoKind, setInfoKind] = useState(null) // null | 'freeze' | 'auto'

  useEffect(() => { fetchStreakMilestones().then(setMilestones) }, [])

  const streak       = profile?.current_streak ?? 0
  const lastClaimed   = profile?.last_claimed_streak_day ?? 0
  const nextClaimDay  = lastClaimed + 1
  const claimable     = nextClaimDay <= streak
  const isPro         = !!(profile?.has_subscription || profile?.is_admin)

  const nextMilestone = milestones.find(m => m.day_number > streak) ?? null
  const prevMilestoneDay = milestones
    .filter(m => m.day_number <= streak)
    .reduce((max, m) => Math.max(max, m.day_number), 0)
  const progressPct = nextMilestone
    ? Math.round(((streak - prevMilestoneDay) / (nextMilestone.day_number - prevMilestoneDay)) * 100)
    : 100

  const windowEnd = nextMilestone
    ? Math.min(nextMilestone.day_number, nextClaimDay + WINDOW_SIZE - 1)
    : nextClaimDay + WINDOW_SIZE - 1
  const days = []
  for (let day = nextClaimDay; day <= windowEnd; day++) {
    const m = milestones.find(x => x.day_number === day)
    days.push({
      day,
      xp: m ? m.xp_reward : 5,
      tickets: m ? m.ticket_reward : 0,
      milestone: !!m,
      status: day === nextClaimDay ? 'current' : 'locked',
      visited: day <= streak, // вход в этот день уже был совершён — красит линию перед нодой
    })
  }

  async function handleClaim() {
    setBusy(true)
    setMsg('')
    const res = await claimStreakReward()
    if (res.ok) {
      await refreshProfile()
      setMsg(res.tickets > 0 ? `+${res.xp} XP и ${res.tickets} 🎟!` : `+${res.xp} XP!`)
    } else {
      setMsg('Не получилось забрать награду')
    }
    setBusy(false)
  }

  async function handleBuyFreeze() {
    setBusy(true)
    const res = await buyStreakFreeze()
    if (res.ok) await refreshProfile()
    else setMsg(res.reason === 'not_enough_tickets' ? 'Не хватает золотых билетов' : 'Уже есть заморозка про запас')
    setBusy(false)
  }

  async function handleBuyAutoFreeze() {
    setBusy(true)
    const res = await buyAutoFreeze()
    if (res.ok) await refreshProfile()
    else setMsg(res.reason === 'not_enough_tickets' ? 'Не хватает золотых билетов' : 'Уже активна')
    setBusy(false)
  }

  return (
    <div className="rwOverlay">
      <header className="rwHeader">
        <button className="rwBack" onClick={onClose}>←</button>
        <h1>Ежедневные награды</h1>
      </header>

      <div className="rwScroll">
        <section className="rwHero">
          <div className="rwHeroIcon">🏆</div>
          <h2>Серия {streak} {streak === 1 ? 'день' : 'дней'}</h2>
          {nextMilestone ? (
            <>
              <p className="rwHeroSub">
                Ещё {nextMilestone.day_number - streak} и получишь{' '}
                <b>{nextMilestone.xp_reward} XP{nextMilestone.ticket_reward > 0 ? ` + ${nextMilestone.ticket_reward} 🎟` : ''}</b>
              </p>
              <div className="rwTrack"><div className="rwFill" style={{ width: `${progressPct}%` }} /></div>
              <div className="rwTrackLabels">
                <span>День {prevMilestoneDay}</span>
                <span>День {nextMilestone.day_number}</span>
              </div>
            </>
          ) : <p className="rwHeroSub">Ты прошёл все известные вехи — так держать!</p>}
        </section>

        <RewardsPath days={days} />
      </div>

      <div className="rwBottom">
        {msg && <div className="rwMsg">{msg}</div>}
        <div className="rwFreezeRow">
          <div className="rwFreezeItem">
            <button className="rwFreezeBtn" disabled={busy || profile?.has_freeze_charge} onClick={handleBuyFreeze}>
              🧊 {profile?.has_freeze_charge ? 'Есть' : 'Купить · 2 🎟'}
            </button>
            <button className="rwInfoBtn" onClick={() => setInfoKind('freeze')} title="Как это работает">?</button>
          </div>

          <div className="rwFreezeItem">
            {isPro ? (
              <button className="rwFreezeBtn rwFreezeBtnPro" disabled>♾️ Активна</button>
            ) : profile?.auto_freeze_charges_left > 0 ? (
              <button className="rwFreezeBtn" disabled>♾️ Осталось {profile.auto_freeze_charges_left}</button>
            ) : (
              <button className="rwFreezeBtn" disabled={busy} onClick={handleBuyAutoFreeze}>♾️ Купить · 3 🎟</button>
            )}
            <button className="rwInfoBtn" onClick={() => setInfoKind('auto')} title="Как это работает">?</button>
          </div>
        </div>

        <button className="rwClaimBtn" disabled={busy || !claimable} onClick={handleClaim}>
          🎁 {claimable ? 'Забрать награду' : 'Приходи завтра'}
        </button>
      </div>

      {infoKind && (
        <div className="rwInfoOverlay" onClick={() => setInfoKind(null)}>
          <div className="rwInfoCard" onClick={e => e.stopPropagation()}>
            {infoKind === 'freeze' ? (
              <>
                <h3>🧊 Заморозка</h3>
                <p>Покупается заранее, не стакается — можно накопить-купить
                  только одну про запас. Если пропустишь день, она сработает
                  сама и спасёт серию, без твоего участия. Стоит 2 🎟.</p>
              </>
            ) : isPro ? (
              <>
                <h3>♾️ Авто заморозка</h3>
                <p>С твоей подпиской PRO серия защищена всегда и бесплатно:
                  суббота и воскресенье прощаются в любом случае, плюс один
                  будний день в неделю — автоматически, покупать не нужно.</p>
              </>
            ) : (
              <>
                <h3>♾️ Авто заморозка</h3>
                <p>Покупка защищает серию на 2 пропущенных дня подряд —
                  сработает сама, без твоего участия. Повторная покупка
                  недоступна, пока защита не закончится. Стоит 3 🎟.</p>
                <p className="rwInfoPro">С подпиской PRO это работает всегда и
                  бесплатно — суббота и воскресенье прощаются в любом случае,
                  плюс один будний день в неделю.</p>
                <button className="rwFreezeBtnPro" onClick={() => { setInfoKind(null); onWantPro?.() }}>
                  👑 Оформить PRO
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
