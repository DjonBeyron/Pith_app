import { useState, useEffect } from 'react'
import RewardsPath from './RewardsPath.jsx'
import RewardClaimPopup from './RewardClaimPopup.jsx'
import FreezeSheet from './FreezeSheet.jsx'
import {
  claimAllStreakRewards, buyStreakFreeze, buyAutoFreeze, fetchStreakMilestones,
} from '../../shared/api/streakApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import BackButton from '../../shared/ui/BackButton.jsx'

const RESET_INFO_KEY = 'pithy_streak_reset_info'

function readResetInfo() {
  try {
    const raw = localStorage.getItem(RESET_INFO_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const WINDOW_SIZE = 7 // сколько дней вперёд рисуем в пути, если веха дальше

// Полноэкранное окно наград (по присланному макету): hero-прогресс до
// следующей вехи, путь дней, заморозки, кнопка «Забрать награду».
// Показывается вручную (блок в профиле) или один раз в день после урока
// (useStreakPopupTrigger.js).
//
// Вехи (fetchStreakMilestones) грузятся отдельно от профиля — пока их нет,
// рендерится ТА ЖЕ реальная разметка (hero/путь/карточки заморозок/кнопка),
// просто с модификатором .rwGhost (см. streak-popup.css): текст и иконки
// прячутся, а на их месте — те же самые силуэты с бегущим бликом. Поэтому
// раскладка не прыгает при переходе скелетон → данные — это один и тот же
// DOM. Профиль обычно уже в кэше, поэтому именно вехи — основной источник
// задержки.
export default function RewardsPopup({ profile, onClose, onWantPro }) {
  const [milestones, setMilestones] = useState(null) // null — ещё не загружено
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [infoKind, setInfoKind] = useState(null) // null | 'freeze' | 'auto'
  const [resetInfo, setResetInfo] = useState(() => readResetInfo())
  const [claimResult, setClaimResult] = useState(null) // { xp, tickets, days, xpBefore } | null

  function loadMilestones() {
    fetchStreakMilestones().then(list => {
      if (list === null) setLoadError(true)
      else { setMilestones(list); setLoadError(false) }
    })
  }

  useEffect(() => {
    loadMilestones()
    refreshProfile() // окно открыто — подтянуть самый свежий профиль (стрик мог обновиться сервером)
  }, [])

  const loading = milestones === null
  const milestonesList = milestones ?? []

  function closeResetNote() {
    try { localStorage.removeItem(RESET_INFO_KEY) } catch { /* ignore */ }
    setResetInfo(null)
  }

  const streak       = profile?.current_streak ?? 0
  const lastClaimed   = profile?.last_claimed_streak_day ?? 0
  const nextClaimDay  = lastClaimed + 1
  const claimable     = nextClaimDay <= streak
  const unclaimed     = Math.max(0, streak - lastClaimed)
  const isPro         = !!(profile?.has_subscription || profile?.is_admin)

  const nextMilestone = milestonesList.find(m => m.day_number > streak) ?? null
  const prevMilestoneDay = milestonesList
    .filter(m => m.day_number <= streak)
    .reduce((max, m) => Math.max(max, m.day_number), 0)
  const progressPct = nextMilestone
    ? Math.round(((streak - prevMilestoneDay) / (nextMilestone.day_number - prevMilestoneDay)) * 100)
    : 100

  const windowStart = Math.max(1, nextClaimDay - 3) // до 3 уже забранных дней видны сверху карты
  const windowEnd = nextMilestone
    ? Math.min(nextMilestone.day_number, nextClaimDay + WINDOW_SIZE - 1)
    : nextClaimDay + WINDOW_SIZE - 1
  const days = []
  for (let day = windowStart; day <= windowEnd; day++) {
    const m = milestonesList.find(x => x.day_number === day)
    days.push({
      day,
      xp: m ? m.xp_reward : 5,
      tickets: m ? m.ticket_reward : 0,
      milestone: !!m,
      // 'done' — уже забран; 'ready' — прожит и ждёт забора (может быть
      // несколько таких дней сразу); 'locked' — день ещё не наступил
      status: day < nextClaimDay ? 'done' : day <= streak ? 'ready' : 'locked',
      visited: day <= streak, // вход в этот день уже был совершён — красит линию перед нодой
    })
  }

  // Куда автоскроллить путь при открытии: на «текущий» день серии, а если
  // окно его не показывает — на последний ready-день в окне.
  const readyDays = days.filter(d => d.status === 'ready')
  const focusDay = days.some(d => d.day === streak)
    ? streak
    : (readyDays.length ? readyDays[readyDays.length - 1].day : null)

  async function handleClaim() {
    setBusy(true)
    setMsg('')
    const xpBefore = profile?.xp ?? 0
    const res = await claimAllStreakRewards()
    if (res.ok) {
      await refreshProfile()
      setClaimResult({ xp: res.xp, tickets: res.tickets, days: res.days, xpBefore })
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
        <BackButton onClick={onClose} label="Закрыть" />
        <h1>Ежедневные награды</h1>
      </header>

      <div className="rwScroll">
        {resetInfo && (
          <div className="rwResetNote">
            <button className="rwResetNoteClose" onClick={closeResetNote}>✕</button>
            <p>
              Серия {resetInfo.lost} дн. прервалась 😔 Награды за неё начислены
              автоматически: <b>+{resetInfo.xp} XP{resetInfo.tickets > 0 ? ` и ${resetInfo.tickets} 🎟` : ''}</b>
            </p>
          </div>
        )}

        <div className={loading ? undefined : 'rwFadeIn'}>
          <section className={`rwHero${loading ? ' rwGhost' : ''}`}>
            <div className="rwHeroIcon">🏆</div>
            <h2>Серия {streak} {streak === 1 ? 'день' : 'дней'}</h2>
            {loading || nextMilestone ? (
              <>
                <p className="rwHeroSub">
                  {loading ? (
                    <>Ещё 3 и получишь <b>10 XP</b></>
                  ) : (
                    <>
                      Ещё {nextMilestone.day_number - streak} и получишь{' '}
                      <b>{nextMilestone.xp_reward} XP{nextMilestone.ticket_reward > 0 ? ` + ${nextMilestone.ticket_reward} 🎟` : ''}</b>
                    </>
                  )}
                </p>
                <div className="rwTrack"><div className="rwFill" style={{ width: `${loading ? 0 : progressPct}%` }} /></div>
                <div className="rwTrackLabels">
                  <span>День {loading ? 1 : prevMilestoneDay}</span>
                  <span>День {loading ? 7 : nextMilestone.day_number}</span>
                </div>
              </>
            ) : <p className="rwHeroSub">Ты прошёл все известные вехи — так держать!</p>}
          </section>

          <RewardsPath key={loading ? 'ghost' : 'real'} ghost={loading} days={days} focusDay={focusDay} />
        </div>

        {loading && loadError && (
          <div className="rwLoadError">
            <p className="rwLoadErrorText">Не удалось загрузить</p>
            <button className="rwRetryBtn" onClick={loadMilestones}>Повторить</button>
          </div>
        )}
      </div>

      <div className="rwBottom">
        {msg && <div className="rwMsg">{msg}</div>}
        <div className="rwFreezeRow">
          <button
            className={`rwFreezeCard${loading ? ' rwGhost' : ''}`}
            disabled={loading}
            onClick={() => setInfoKind('freeze')}
          >
            <span className="rwFreezeCardIcon">🧊</span>
            <span className="rwFreezeCardBody">
              <span className="rwFreezeCardName">Заморозка</span>
              <span className={`rwFreezeCardStatus${profile?.has_freeze_charge ? ' rwFreezeCardStatusOn' : ''}`}>
                {profile?.has_freeze_charge ? 'Есть' : '2 🎟'}
              </span>
            </span>
          </button>

          <button
            className={`rwFreezeCard${loading ? ' rwGhost' : ''}`}
            disabled={loading}
            onClick={() => setInfoKind('auto')}
          >
            <span className="rwFreezeCardIcon">♾️</span>
            <span className="rwFreezeCardBody">
              <span className="rwFreezeCardName">Авто заморозка</span>
              <span className={`rwFreezeCardStatus${(isPro || profile?.auto_freeze_charges_left > 0) ? ' rwFreezeCardStatusOn' : ''}`}>
                {isPro ? 'PRO' : profile?.auto_freeze_charges_left > 0 ? `Осталось ${profile.auto_freeze_charges_left}` : '3 🎟'}
              </span>
            </span>
          </button>
        </div>

        <button className={`rwClaimBtn${loading ? ' rwGhost' : ''}`} disabled={busy || loading || !claimable} onClick={handleClaim}>
          <span className="rwClaimBtnLabel">
            {unclaimed >= 2 ? `🎁 Забрать всё · ${unclaimed} дн.` : claimable ? '🎁 Забрать награду' : '🎁 Приходи завтра'}
          </span>
        </button>
      </div>

      <FreezeSheet
        kind={infoKind}
        profile={profile}
        isPro={isPro}
        busy={busy}
        onBuyFreeze={handleBuyFreeze}
        onBuyAutoFreeze={handleBuyAutoFreeze}
        onWantPro={onWantPro}
        onClose={() => setInfoKind(null)}
      />

      {claimResult && (
        <RewardClaimPopup
          xp={claimResult.xp}
          tickets={claimResult.tickets}
          days={claimResult.days}
          xpBefore={claimResult.xpBefore}
          onClose={() => setClaimResult(null)}
        />
      )}
    </div>
  )
}
