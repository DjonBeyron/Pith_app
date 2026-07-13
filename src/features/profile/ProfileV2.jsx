import { useState, useEffect } from 'react'
import { useProfileV2Data } from './useProfileV2Data.js'
import { getCurrentLevel, getNextLevel } from '../../shared/lib/xpLevels.js'
import CurriculumView from '../lessons/CurriculumView.jsx'
import SettingsTab from '../settings/SettingsTab.jsx'
import NicknameCard from './NicknameCard.jsx'
import CustomizationScreen from './CustomizationScreen.jsx'
import AvatarPickerPopup from './AvatarPickerPopup.jsx'
import ProPaywall from '../pro/ProPaywall.jsx'
import RewardsPopup from '../streak/RewardsPopup.jsx'
import { plural } from '../../shared/lib/plural.js'
import { avatarUrl } from '../../shared/lib/avatarPack.js'
import { saveAvatar } from '../../shared/api/profileApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { GEAR_PATH } from '../../shared/ui/icons.js'

const BOLT = 'M13 2 4 14h6l-1 8 9-12h-6l1-8z'
// Копилка слов: бесплатно видно первые 20, дальше — только с Pro
const WORDS_FREE_CAP = 20

// Профиль (ui v2, тёмная тема по макету profile.html): уровень, XP-бар,
// энергия, вкладки Сохранённые / Пройденные / Копилка слов. Шестерёнка —
// экран настроек. Тап по модулю в списках открывает его схему.
export default function ProfileV2({ visible = true, userEmail, onOpenCanvas }) {
  const { profile, modules, bookmarks, words, loading, reload } = useProfileV2Data()
  const [tab, setTab] = useState('words') // saved | done | words
  const [showSettings, setShowSettings] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [showPro, setShowPro] = useState(false)
  const [showRewards, setShowRewards] = useState(false)
  const [openModule, setOpenModule] = useState(null)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)

  async function changeAvatar(seed) {
    setAvatarBusy(true)
    await saveAvatar(seed)
    await refreshProfile()
    setAvatarBusy(false)
  }

  // Возврат на вкладку: тихое фоновое обновление (XP, копилка, закладки) —
  // без «Загрузки...» и моргания, пользователь видит сразу свежие данные
  useEffect(() => {
    if (visible) reload()
  }, [visible, reload])

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
        <button className="pvBack" onClick={() => setShowSettings(false)}>← Профиль</button>
        <NicknameCard />
        <div className="shellV2Panel"><SettingsTab /></div>
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

  const saved    = modules.filter(m => bookmarks.has(m.id))
  const doneMods = modules.filter(m => m.total > 0 && m.pct === 100)

  return (
    <div className="pvScreen">
      <div className="pvHead">
        <button className="pvGear" onClick={() => setShowSettings(true)} title="Настройки">
          {/* Грубая шестерёнка Android/Material — та же, что на финальном
              слайде установки (см. shared/ui/icons.js) */}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d={GEAR_PATH} /></svg>
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
            <span className="pvName">{name}</span>
            {(profile?.has_subscription || profile?.is_admin) && <span className="pvProBadge">PRO</span>}
          </div>
          <span className="pvLvlChip">★ {cur.level} уровень · {cur.label}</span>
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
            <b>{profile?.has_subscription ? '∞' : `${energy}/5`}</b>
          </div>
          <div className="pvEnergyBolts">
            {[0, 1, 2, 3, 4].map(i => (
              <svg key={i} className={i < energy ? 'pvBolt' : 'pvBolt pvBoltOff'} viewBox="0 0 24 24" fill="currentColor"><path d={BOLT} /></svg>
            ))}
          </div>
        </div>
      </div>

      {/* Pithy Pro: статус подписки или ненавязчивое предложение.
          Админ = Pro автоматически (безлимит и значок у него и так есть) */}
      {profile?.has_subscription || profile?.is_admin ? (
        <div className="pvCard pvProCard">
          <span>👑 Pithy Pro</span>
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
          <span className="pvBuyIcon">🎖️</span>
          <span className="pvBuyText">Купить подписку</span>
          <span className="pvBuyPrice">399 ₽/мес</span>
        </button>
      )}
      {showPro && <ProPaywall onClose={() => setShowPro(false)} />}

      {/* Ежедневный стрик: статус + ручной вход в окно наград */}
      <button className="pvCard pvStreakBtn" onClick={() => setShowRewards(true)}>
        <span>🔥 Ежедневные награды</span>
        <span className="pvStreakVal">{profile?.current_streak ?? 0} {plural(profile?.current_streak ?? 0, 'день', 'дня', 'дней')}</span>
      </button>

      {/* Кастомизация: достижения и косметика (подложка/рамка/медаль) */}
      <button className="pvCard pvCustomizeBtn" onClick={() => setShowCustomize(true)}>
        <span className="pvCustomizeLabel">✨ Кастомизация</span>
      </button>

      <div className="pvTabs">
        <button className={tab === 'saved' ? 'pvTab pvTabActive' : 'pvTab'} onClick={() => setTab('saved')}>Сохранённые</button>
        <button className={tab === 'done'  ? 'pvTab pvTabActive' : 'pvTab'} onClick={() => setTab('done')}>Пройденные</button>
        <button className={tab === 'words' ? 'pvTab pvTabActive' : 'pvTab'} onClick={() => setTab('words')}>Копилка слов</button>
      </div>

      {loading ? (
        <div className="pvEmpty">Загрузка...</div>
      ) : tab === 'words' ? (
        words.length === 0
          ? <div className="pvEmpty">Проходи уроки — выученные слова будут копиться здесь</div>
          : <WordsList
              words={words}
              unlimited={!!(profile?.has_subscription || profile?.is_admin)}
              onWantPro={() => setShowPro(true)}
            />
      ) : (
        (tab === 'saved' ? saved : doneMods).length === 0
          ? <div className="pvEmpty">
              {tab === 'saved'
                ? 'Сохраняй модули закладкой в ленте — они появятся здесь'
                : 'Пройди модуль до конца — он появится здесь'}
            </div>
          : (tab === 'saved' ? saved : doneMods).map(m => (
            <button key={m.id} className="pvWord pvModRow" onClick={() => setOpenModule(m)}>
              <span className="pvWordText">{m.title}</span>
              <span className="pvWordFrom">
                {m.pct === 100 ? 'пройден' : `${m.pct}%`}
              </span>
            </button>
          ))
      )}

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
    </div>
  )
}

// Копилка слов: бесплатным видно первые WORDS_FREE_CAP слов + счётчик,
// остальные — за строкой-замком, которая открывает экран Pro
function WordsList({ words, unlimited, onWantPro }) {
  const shown  = unlimited ? words : words.slice(0, WORDS_FREE_CAP)
  const hidden = words.length - shown.length

  return (
    <>
      <div className="pvWordsCount">
        {unlimited
          ? `${words.length} ${plural(words.length, 'слово', 'слова', 'слов')}`
          : `${Math.min(words.length, WORDS_FREE_CAP)} из ${WORDS_FREE_CAP} бесплатных`}
      </div>
      {shown.map(w => (
        <div key={w.id} className="pvWord pvWordCard">
          <span className="pvWordText">{w.word}</span>
          <span className="pvWordFrom">{w.from}</span>
        </div>
      ))}
      {hidden > 0 && (
        <button className="pvWord pvWordsLocked" onClick={onWantPro}>
          <span className="pvWordText">🔒 ещё {hidden} {plural(hidden, 'слово', 'слова', 'слов')}</span>
          <span className="pvWordFrom">открыть с Pro →</span>
        </button>
      )}
    </>
  )
}
