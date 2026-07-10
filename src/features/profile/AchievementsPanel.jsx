import UserBadge from '../../shared/ui/UserBadge.jsx'

// Описания трёх достижений: какое условие и какую косметику открывает.
// key косметики = поле в user_profiles.cosmetics.
const ACH_DEFS = [
  {
    kind: 'level10', cosmeticKey: 'bg', icon: '⭐',
    name: '10-й уровень',
    desc: 'Достигни 10-го уровня («Легенда», 8000 XP). Открывает подложку под ник.',
  },
  {
    kind: 'race_finisher', cosmeticKey: 'frame', icon: '🏁',
    name: 'Участник гонки',
    desc: 'Финишируй еженедельную супергонку. Открывает рамку вокруг аватара.',
  },
  {
    kind: 'race_winner', cosmeticKey: 'medal', icon: '🏆',
    name: 'Победитель гонки',
    desc: 'Попади в тройку призёров супергонки. Открывает медаль с твоим местом.',
  },
]

// Субвкладка «Достижения»: три карточки с кнопками «Надеть/Снять» и
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
          cosmetics={cosmetics}
          medalPlace={medalPlace}
          size={38}
        />
        <span className="ratingXp">{profile?.xp ?? 0} XP</span>
      </div>

      {ACH_DEFS.map(def => {
        const unlocked = unlockedKinds.has(def.kind)
        const worn     = !!cosmetics[def.cosmeticKey]
        return (
          <div key={def.kind} className={unlocked ? 'achCard' : 'achCard achCardLocked'}>
            <div className="achIcon">{unlocked ? def.icon : '🔒'}</div>
            <div>
              <div className="achName">
                {def.name}
                {def.kind === 'race_winner' && medalPlace ? ` — место ${medalPlace}` : ''}
              </div>
              <div className="achDesc">{def.desc}</div>
            </div>
            <button
              className={worn ? 'achEquipBtn achEquipBtnOn' : 'achEquipBtn'}
              disabled={!unlocked}
              onClick={() => toggle(def.cosmeticKey)}
            >
              {!unlocked ? 'Закрыто' : worn ? 'Снять' : 'Надеть'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
