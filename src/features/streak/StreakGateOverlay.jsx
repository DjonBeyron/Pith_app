import { useState, useEffect } from 'react'
import StreakGuardRow from './StreakGuardRow.jsx'
import StreakCountUp from './StreakCountUp.jsx'
import BurstConfetti from '../../shared/ui/BurstConfetti.jsx'
import FreezeSheet from './FreezeSheet.jsx'
import RewardsPopup from './RewardsPopup.jsx'
import ProPaywall from '../pro/ProPaywall.jsx'
import TicketIcon from '../../shared/ui/TicketIcon.jsx'
import { useFreezeBuy } from './useFreezeBuy.js'
import { getCachedProfile, subscribeProfile } from '../../shared/api/profileCache.js'

const RESET_INFO_KEY = 'pithy_streak_reset_info'
// Тот же салют, что на верный ответ, но в лавандовой гамме окна:
// красный/голубой из урока на тёмно-фиолетовом фоне читались как чужие
const SG_CONFETTI = ['#c9b6ff', '#9b7bff', '#efe9ff', '#7c56e9', '#ffd98a']

function days(n) {
  const t = n % 100
  if (t >= 11 && t <= 14) return 'дней'
  const o = n % 10
  return o === 1 ? 'день' : o >= 2 && o <= 4 ? 'дня' : 'дней'
}

// Тексты трёх состояний окна. Разделены по смыслу, а не по одной строке с
// подстановкой: «серия прервалась» и «серия спасена» — это разные новости,
// и общий праздничный тон подошёл бы только первой.
//
// Держим коротко: заголовок + число + «дней подряд» уже говорят всё. Подпись
// над числом и мотивационная строка внизу пересказывали то же самое третий
// раз — экран от них только тяжелел. Чем спасена серия, объясняет строка
// защиты (StreakGuardRow), поэтому отдельного текста про это тоже нет.
function copy(state, res) {
  if (state === 'reset') {
    return {
      title: <>Серия <span className="sgAccentMuted">прервалась</span></>,
      count: res.lost_streak ?? 0,
      btn: 'Начать заново',
    }
  }
  if (state === 'saved') {
    return {
      eyebrow: 'С возвращением!',
      title: <>Серия <span className="sgAccent">спасена!</span></>,
      count: res.streak ?? 0,
      btn: 'Продолжить',
    }
  }
  return {
    eyebrow: 'Добро пожаловать!',
    title: <>Ты <span className="sgAccent">сохранил</span> свою серию!</>,
    count: res.streak ?? 0,
    btn: 'Продолжить',
  }
}

// Полноэкранное окно серии при первом за сутки заходе (см. useStreakGate:
// «первый раз» решает сервер, не localStorage). Показывается сразу, ещё под
// стартовым сплэшем — логотип улетает и открывает уже готовое окно.
// Заменило плашку StreakDailyToast в схеме уроков: один показ в день вместо
// двух.
// ready — стартовый сплэш уже улетел и окно реально видно. До этого момента
// ни салют, ни счётчик не запускаем: логотип перекрывает всё окно (у него
// z-index 2147483000), и праздник отыгрывал за ним впустую.
export default function StreakGateOverlay({ state, res, onClose, ready = true }) {
  const [profile, setProfile] = useState(() => getCachedProfile())
  const [sheet, setSheet] = useState(null)        // null | 'freeze' | 'auto'
  const [rewardsOpen, setRewardsOpen] = useState(false)
  const [wantPro, setWantPro] = useState(false)
  const { busy, msg, buyFreeze, buyAuto } = useFreezeBuy()
  const [live, setLive] = useState(false)
  // Барабаны докрутились до нового дня — момент для салюта и волны
  const [peak, setPeak] = useState(false)

  useEffect(() => subscribeProfile(setProfile), [])

  // Небольшая пауза после ухода логотипа: окно успевает проявиться, и только
  // потом взлетает салют — иначе он стартует в кадре, где ещё идёт затухание
  useEffect(() => {
    if (!ready || live) return
    const t = setTimeout(() => setLive(true), 320)
    return () => clearTimeout(t)
  }, [ready, live])

  // Про срыв рассказывает это окно — плашка-дубль в окне наград не нужна.
  useEffect(() => {
    if (state === 'reset') { try { localStorage.removeItem(RESET_INFO_KEY) } catch { /* ignore */ } }
  }, [state])

  const c = copy(state, res)
  const claimed = profile?.last_claimed_streak_day ?? 0
  // Есть незабранная награда за прожитый день серии — раньше об этом
  // напоминала плашка в схеме уроков, теперь строка живёт здесь.
  const claimable = state !== 'reset' && claimed + 1 <= (profile?.current_streak ?? 0)
  const gained = state === 'reset' ? res.auto_claimed : null
  const isPro = !!res.is_pro

  if (rewardsOpen && profile) {
    return (
      <RewardsPopup
        profile={profile}
        onClose={() => { setRewardsOpen(false); onClose() }}
        onWantPro={() => { setRewardsOpen(false); setWantPro(true) }}
      />
    )
  }

  // Длинная серия (1348 дней) не должна упираться в края карточки —
  // ступенькой уменьшаем кегль, дальше высоту доводит clamp в CSS
  const digits = String(c.count).length
  const countCls = digits >= 5 ? 'sgCount sgCountXs' : digits === 4 ? 'sgCount sgCountSm' : 'sgCount'

  return (
    <div className="sgOverlay">
      {/* Отдельная обёртка, а не центрирование самого оверлея: при нехватке
          высоты flex-центрирование срезает верх контента, а так экран просто
          начинает скроллиться целиком */}
      <div className="sgScroll">
      <div className="sgInner">
        {/* Три зоны: шапка у верхнего края, число по центру, кнопки внизу.
            Сплошное центрирование оставляло на высоком экране (iPhone 16 Pro)
            пустоты сверху и снизу, а заголовок висел посреди них */}
        <div className="sgHead">
          {c.eyebrow && <p className="sgEyebrow">{c.eyebrow}</p>}
          <h1 className="sgTitle">{c.title}</h1>
        </div>

        <div className="sgBody">
        <div className={state === 'reset' ? 'sgCard sgCardLost' : 'sgCard'}>
          {/* Оборванную серию не крутим: from не передаём */}
          <StreakCountUp
            value={c.count}
            from={state === 'reset' ? null : c.count - 1}
            className={countCls}
            run={live}
            onDone={() => setPeak(true)}
          />
          <div className="sgUnit"><span>{days(c.count)} подряд</span></div>
        </div>

        {gained && (gained.xp > 0 || gained.tickets > 0) && (
          <p className="sgGained">
            Награды не сгорели:{' '}
            {gained.xp > 0 && <b>+{gained.xp} XP</b>}
            {gained.xp > 0 && gained.tickets > 0 && ' · '}
            {gained.tickets > 0 && <b>+{gained.tickets} <TicketIcon className="sgGainedIcon" /></b>}
          </p>
        )}

        <StreakGuardRow
          state={state}
          res={res}
          profile={profile}
          onOpenSheet={setSheet}
          onWantPro={() => setWantPro(true)}
        />

        {msg && <p className="sgMsg">{msg}</p>}
        </div>

        <div className="sgActions">
        {claimable && (
          <button className="sgClaimBtn" onClick={() => setRewardsOpen(true)}>
            Забрать награду
          </button>
        )}
        <button className="sgBtn" onClick={onClose}>{c.btn}</button>
        </div>
      </div>
      </div>

      {/* Салют и волна — на самом переключении дня, не раньше. Над
          оборванной серией праздника нет вовсе */}
      {peak && state !== 'reset' && <span className="sgWave" />}
      {peak && state !== 'reset' && <BurstConfetti count={26} size={5} colors={SG_CONFETTI} />}

      <FreezeSheet
        kind={sheet}
        profile={profile}
        isPro={isPro}
        busy={busy}
        onBuyFreeze={buyFreeze}
        onBuyAutoFreeze={buyAuto}
        onWantPro={() => setWantPro(true)}
        onClose={() => setSheet(null)}
      />
      {wantPro && <ProPaywall onClose={() => setWantPro(false)} />}
    </div>
  )
}
