import { useState, useEffect } from 'react'
import { Zap, Crown, Sparkles, Paintbrush, Star } from 'lucide-react'
import { useProfileV2Data } from './useProfileV2Data.js'
import { getCurrentLevel, getNextLevel } from '../../shared/lib/xpLevels.js'
import CurriculumView from '../lessons/CurriculumView.jsx'
import SettingsTab from '../settings/SettingsTab.jsx'
import NicknameCard from './NicknameCard.jsx'
import LogoutSheet from './LogoutSheet.jsx'
import CustomizationScreen from './CustomizationScreen.jsx'
import AvatarPickerPopup from './AvatarPickerPopup.jsx'
import ProPaywall from '../pro/ProPaywall.jsx'
import RewardsPopup from '../streak/RewardsPopup.jsx'
import { plural } from '../../shared/lib/plural.js'
import { avatarUrl } from '../../shared/lib/avatarPack.js'
import { saveAvatar } from '../../shared/api/profileApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import BackButton from '../../shared/ui/BackButton.jsx'
import { energyColor } from '../../shared/lib/energyColors.js'
import ProfileSavedTab from './ProfileSavedTab.jsx'
import GearIcon from '../../shared/ui/GearIcon.jsx'
import { useAuth } from '../../shared/lib/useAuth.js'
import { useUnseenCustomization } from './useUnseenCustomization.js'
import { useScrollCalm } from './useScrollCalm.js'
import { hasUnclaimedStreak } from '../streak/streakClaim.js'
import { onProfileHome } from '../../shared/lib/profileHomeEvent.js'

// Профиль (ui v2, тёмная тема по макету profile.html) — «кто я?»: аватар, ник и уровень, XP-бар, энергия, подписка,
// «Ежедневные награды» (блестит, пока награда не получена), «Кастомизация профиля» (блестит, пока есть открытая и не
// просмотренная косметика) и «Сохранённые уроки» — только НЕ начатые модули (по умолчанию свёрнуто). «Пройденные» и копилка
// слов убраны: память слов живёт во вкладке «Память», начатое — в «Моих уроках» (PROJECT.md → «Вкладки»). Шестерёнка —
// экран настроек (там же «Повторение»: минуты в день, «Отпуск», итоги недели). Тап по модулю — его схема.
export default function ProfileV2({ visible = true, userEmail, onOpenCanvas, learnView = null, onLearnChanged }) {
  const { profile, modules, bookmarks, loading, reload } = useProfileV2Data()
  const [showSettings, setShowSettings] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [showPro, setShowPro] = useState(false)
  const [showRewards, setShowRewards] = useState(false)
  const [openModule, setOpenModule] = useState(null)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const { user } = useAuth()
  const unseenCustom = useUnseenCustomization(user?.id, visible, showCustomize)
  const calmScroll = useScrollCalm()

  async function changeAvatar(seed) {
    setAvatarBusy(true)
    await saveAvatar(seed)
    await refreshProfile()
    setAvatarBusy(false)
  }

  // Возврат на вкладку: тихое фоновое обновление (XP, закладки) —
  // без «Загрузки...» и моргания, пользователь видит сразу свежие данные
  useEffect(() => {
    if (visible) reload()
  }, [visible, reload])

  // Нажатие на активную вкладку «Профиль» в нижней панели = назад на главный экран профиля
  // из «Кастомизации» (достижения), настроек или схемы модуля (profileHomeEvent.js)
  useEffect(() => onProfileHome(() => {
    setShowCustomize(false)
    setShowSettings(false)
    setOpenModule(null)
  }), [])

  if (openModule) {
    return (
      <div className="feedModuleScreen">
        <CurriculumView
          curriculumId={openModule.id}
          curriculumTitle={openModule.title}
          onBack={() => setOpenModule(null)}
          onOpenCanvas={onOpenCanvas}
        />
      </div>
    )
  }

  if (showCustomize) {
    return <CustomizationScreen onBack={() => setShowCustomize(false)} />
  }

  if (showSettings) {
    return (
      <div className="pvSettingsScreen">
        <BackButton onClick={() => setShowSettings(false)} label="Профиль" className="pvBack" />
        <NicknameCard />
        <div className="shellV2Panel"><SettingsTab learnView={learnView} onLearnChanged={onLearnChanged} /></div>
      </div>
    )
  }

  const xp   = profile?.xp ?? 0
  const cur  = getCurrentLevel(xp)
  const next = getNextLevel(xp)
  const xpPct = next
    ? Math.round(((xp - cur.xpNeeded) / (next.xpNeeded - cur.xpNeeded)) * 100)
    : 100
  const energy = Math.min(profile?.energy ?? 0, 5)
  // Ник из профиля (виден в рейтинге); до загрузки/без ника — часть email
  const name = profile?.nickname || (userEmail?.split('@')[0] ?? 'Профиль')

  // Сохранённые — только не начатые: начатое продолжают из «Моих уроков»
  const saved = modules.filter(m => bookmarks.has(m.id) && m.done === 0)

  return (
    <div className="pvScreen" onScroll={calmScroll}>
      <div className="pvHead">
        <button className="pvGear" onClick={() => setShowSettings(true)} title="Настройки">
          <GearIcon />
        </button>
      </div>

      <div className="pvWho">
        <div className="pvAvatarSlot">
          <button className="pvAvatarBtn" onClick={() => setShowAvatarPicker(true)} title="Сменить аватар">
            {profile?.avatar_seed ? (
              <img className="pvAvatar pvAvatarImg" src={avatarUrl(profile.avatar_seed)} alt="" />
            ) : (
              <div className="pvAvatar">{name.slice(0, 1).toUpperCase()}</div>
            )}
          </button>
          {!profile?.avatar_seed && (
            <button
              className="pvAvatarAdd"
              onClick={() => setShowAvatarPicker(true)}
              title="Выбрать аватар"
            >+</button>
          )}
        </div>
        <div>
          <div className="pvNameRow">
            <button className="pvName pvNameBtn" onClick={() => setShowLogout(true)} title="Выйти из аккаунта">{name}</button>
            {(profile?.has_subscription || profile?.is_admin) && <span className="pvProBadge">PRO</span>}
          </div>
          <span className="pvLvlChip"><Star className="pvLvlChipIcon" /> {cur.level} уровень · {cur.label}</span>
        </div>
      </div>

      <div className="pvCard pvStatsCard">
        <div className="pvStatCol">
          <div className="pvStatTop">
            <span>Опыт</span>
            <b>{xp}{next ? ` / ${next.xpNeeded}` : ''}</b>
          </div>
          <div className="pvTrack"><div className="pvFill" style={{ width: `${xpPct}%` }} /></div>
        </div>
        <div className="pvStatDivider" />
        <div className="pvStatCol">
          <div className="pvStatTop">
            <span>Энергия</span>
            <b style={profile?.has_subscription ? undefined : { color: energyColor(energy) }}>
              {profile?.has_subscription ? '∞' : `${energy}/5`}
            </b>
          </div>
          <div className="pvEnergyBolts">
            {[0, 1, 2, 3, 4].map(i => (
              <Zap
                key={i}
                className={i < energy ? 'pvBolt' : 'pvBolt pvBoltOff'}
                style={i < energy ? { color: energyColor(energy) } : undefined}
                fill="currentColor" stroke="none"
              />
            ))}
          </div>
        </div>
      </div>

      {/* HETA Pro: статус подписки или ненавязчивое предложение.
          Админ = Pro автоматически (безлимит и значок у него и так есть) */}
      {profile?.has_subscription || profile?.is_admin ? (
        <div className="pvCard pvProCard">
          <span className="pvIconLabel"><Crown size={16} /> HETA Pro</span>
          <b className="pvProState">
            {profile.is_admin
              ? 'админ — безлимит'
              : profile.subscription_until
                ? `до ${new Date(profile.subscription_until).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}`
                : 'активна'}
          </b>
        </div>
      ) : (
        <button className="pvBuyBtn" onClick={() => setShowPro(true)}>
          <span className="pvBuyIcon"><Crown size={18} /></span>
          <span className="pvBuyText">Купить подписку</span>
          <span className="pvBuyPrice">399 ₽/мес</span>
        </button>
      )}
      {showPro && <ProPaywall onClose={() => setShowPro(false)} />}

      {/* Ежедневный стрик: статус + ручной вход в окно наград */}
      <button className={`pvCard pvStreakBtn${hasUnclaimedStreak(profile) ? ' pvShine pvShine--warm' : ''}`} onClick={() => setShowRewards(true)}>
        <span className={`pvCardLabel${hasUnclaimedStreak(profile) ? ' pvIconGlow pvIconGlow--warm' : ''}`}><Sparkles size={16} /> Ежедневные награды</span>
        <span className="pvStreakVal">{profile?.current_streak ?? 0} {plural(profile?.current_streak ?? 0, 'день', 'дня', 'дней')}</span>
      </button>

      {/* Кастомизация профиля: достижения и косметика (подложка/рамка/медаль); блестит, пока есть не просмотренное */}
      <button className={`pvCard pvCustomizeBtn${unseenCustom ? ' pvShine' : ''}`} onClick={() => setShowCustomize(true)}>
        <span className={`pvCardLabel${unseenCustom ? ' pvIconGlow pvIconGlow--lime' : ''}`}><Paintbrush size={16} /> Кастомизация профиля</span>
      </button>

      <ProfileSavedTab savedModules={saved} loading={loading} onOpenModule={setOpenModule} />

      {showAvatarPicker && (
        <AvatarPickerPopup
          selected={profile?.avatar_seed}
          busy={avatarBusy}
          onSelect={changeAvatar}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {showRewards && (
        <RewardsPopup
          profile={profile}
          onClose={() => setShowRewards(false)}
          onWantPro={() => { setShowRewards(false); setShowPro(true) }}
        />
      )}

      {showLogout && (
        <LogoutSheet email={userEmail} onClose={() => setShowLogout(false)} />
      )}
    </div>
  )
}
