import { Star, Trophy, Lock, Flag, Footprints } from 'lucide-react'
import UserBadge from '../../shared/ui/UserBadge.jsx'
import TicketIcon from '../../shared/ui/TicketIcon.jsx'
import { ACHIEVEMENTS } from '../../shared/lib/achievementKinds.js'

// Иконки достижений по виду; названия, условия и ключи косметики — в shared/lib/achievementKinds.js
const ICONS = {
  journey_start: <Footprints size={20} />,
  level10: <Star size={20} />,
  clean_final: <TicketIcon style={{ width: 20, height: 20 }} />,
  race_finisher: <Flag size={20} />,
  race_winner: <Trophy size={20} />,
}

// Экран «Кастомизация профиля»: карточки достижений (с кнопками «Надеть/Снять», если достижение открывает косметику) и
// предпросмотр — как ты выглядишь в общем рейтинге с надетой косметикой.
export default function AchievementsPanel({ achievements, cosmetics, equip, profile, myId }) {
  const unlockedKinds = new Set(achievements.map(a => a.kind))
  const medalPlace = achievements.find(a => a.kind === 'race_winner')?.meta?.place ?? null

  function toggle(key) {
    equip({ ...cosmetics, [key]: !cosmetics[key] })
  }

  return (
    <div className="achList">
      {/* Предпросмотр своей строки в рейтинге */}
      <div className="achPreview">
        <span className="ratingPlace">?</span>
        <UserBadge
          nickname={profile?.nickname || 'Ты'}
          userId={myId ?? ''}
          avatarSeed={profile?.avatar_seed}
          cosmetics={cosmetics}
          medalPlace={medalPlace}
          size={38}
        />
        <span className="ratingXp">{profile?.xp ?? 0} XP</span>
      </div>

      {ACHIEVEMENTS.map(def => {
        const unlocked = unlockedKinds.has(def.kind)
        const worn     = !!def.cosmeticKey && !!cosmetics[def.cosmeticKey]
        return (
          <div key={def.kind} className={unlocked ? 'achCard' : 'achCard achCardLocked'}>
            <div className="achIcon">{unlocked ? ICONS[def.kind] : <Lock size={20} />}</div>
            <div>
              <div className="achName">
                {def.name}
                {def.kind === 'race_winner' && medalPlace ? ` — место ${medalPlace}` : ''}
              </div>
              <div className="achDesc">{def.desc}</div>
            </div>
            {def.cosmeticKey ? (
              <button
                className={worn ? 'achEquipBtn achEquipBtnOn' : 'achEquipBtn'}
                disabled={!unlocked}
                onClick={() => toggle(def.cosmeticKey)}
              >
                {!unlocked ? 'Закрыто' : worn ? 'Снять' : 'Надеть'}
              </button>
            ) : (
              <span className="achEquipBtn achEquipBtnOn achGot">{unlocked ? 'Получено' : 'Закрыто'}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
