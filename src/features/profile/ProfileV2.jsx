import { useState, useEffect } from 'react'
import { useProfileV2Data } from './useProfileV2Data.js'
import { getCurrentLevel, getNextLevel } from '../../shared/lib/xpLevels.js'
import CurriculumView from '../lessons/CurriculumView.jsx'
import SettingsTab from '../settings/SettingsTab.jsx'
import PushToggle from './PushToggle.jsx'
import NicknameCard from './NicknameCard.jsx'
import CustomizationScreen from './CustomizationScreen.jsx'

const BOLT = 'M13 2 4 14h6l-1 8 9-12h-6l1-8z'

// Профиль (ui v2, тёмная тема по макету profile.html): уровень, XP-бар,
// энергия, вкладки Сохранённые / Пройденные / Копилка слов. Шестерёнка —
// экран настроек. Тап по модулю в списках открывает его схему.
export default function ProfileV2({ visible = true, userEmail, onOpenCanvas }) {
  const { profile, modules, bookmarks, words, loading, reload } = useProfileV2Data()
  const [tab, setTab] = useState('words') // saved | done | words
  const [showSettings, setShowSettings] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [openModule, setOpenModule] = useState(null)

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
        <h1>Профиль</h1>
        <button className="pvGear" onClick={() => setShowSettings(true)} title="Настройки">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></svg>
        </button>
      </div>

      <div className="pvWho">
        <div className="pvAvatar">{name.slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="pvName">{name}</div>
          <span className="pvLvlChip">{cur.level} уровень · {cur.label}</span>
        </div>
      </div>

      <div className="pvCard">
        <div className="pvCardTop">
          <span>Опыт</span>
          <b>{xp}{next ? ` / ${next.xpNeeded}` : ''} XP</b>
        </div>
        <div className="pvTrack"><div className="pvFill" style={{ width: `${xpPct}%` }} /></div>
      </div>

      <div className="pvCard pvEnergyRow">
        {[0, 1, 2, 3, 4].map(i => (
          <svg key={i} className={i < energy ? 'pvBolt' : 'pvBolt pvBoltOff'} viewBox="0 0 24 24" fill="currentColor"><path d={BOLT} /></svg>
        ))}
        <span className="pvEnergyLabel">
          {profile?.has_subscription ? 'безлимит' : `энергия ${energy} из 5`}
        </span>
      </div>

      <PushToggle />

      {/* Кастомизация: достижения и косметика (подложка/рамка/медаль) */}
      <button className="pvCard pvCustomizeBtn" onClick={() => setShowCustomize(true)}>
        <span>🏆 Кастомизация</span>
        <b>достижения и внешний вид →</b>
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
          : words.map(w => (
            <div key={w.id} className="pvWord">
              <span className="pvWordText">{w.word}</span>
              <span className="pvWordFrom">{w.from}</span>
            </div>
          ))
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
    </div>
  )
}
