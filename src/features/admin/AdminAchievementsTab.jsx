import { useState, useEffect, useCallback } from 'react'
import { fetchMyAchievements, adminSetAchievement } from '../../shared/api/ratingApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { ACHIEVEMENTS } from '../../shared/lib/achievementKinds.js'

// Админ → «Достижения»: поставить или снять СЕБЕ любое достижение (admin_set_achievement, миграция
// 20261003120000_achievement_journey_start.sql) — проверить «Кастомизацию профиля», блеск её блока, рейтинг и т.п., не
// проходя игру. Снятие достижения снимает и открытую им косметику. Для «Победителя гонки» выбирается место 1–3.
export default function AdminAchievementsTab() {
  const [mine, setMine] = useState(null) // Map: вид → запись; null — загрузка
  const [place, setPlace] = useState(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => fetchMyAchievements().then(list => setMine(new Map(list.map(a => [a.kind, a])))), [])
  useEffect(() => { load() }, [load]) // первичная загрузка

  async function setOne(def, on) {
    setBusy(true)
    const r = await adminSetAchievement(def.kind, on, def.kind === 'race_winner' ? place : null)
    setNote(!r?.ok ? 'Не вышло (нужна миграция 20261003120000_achievement_journey_start.sql и права админа)'
      : `${on ? 'Выдано' : 'Снято'}: «${def.name}»`)
    await load()
    refreshProfile() // профиль и «Кастомизация профиля» подхватят изменение
    setBusy(false)
  }

  return (
    <div className="aeWrap">
      <div className="aeHead">
        <span className="aeTitle">Достижения (тест)</span>
        <button className="aeRefresh" onClick={load}>Обновить</button>
      </div>
      <p className="aeHint">Выдаёт и снимает достижения только твоему аккаунту. Блок «Кастомизация профиля» в профиле блестит, пока открытая косметика не просмотрена.</p>
      {note && <p className="aeHint">{note}</p>}
      {ACHIEVEMENTS.map(def => {
        const has = mine?.has(def.kind)
        return (
          <div key={def.kind} className="aeRow aaRow">
            <span className="aaName">{def.name}</span>
            <span className="aaState">
              {mine == null ? '…' : has ? `есть${def.kind === 'race_winner' && mine.get(def.kind)?.meta?.place ? ` · место ${mine.get(def.kind).meta.place}` : ''}` : 'нет'}
            </span>
            {def.kind === 'race_winner' && (
              <select className="aaPlace" value={place} onChange={e => setPlace(Number(e.target.value))} aria-label="Место в гонке">
                {[1, 2, 3].map(n => <option key={n} value={n}>место {n}</option>)}
              </select>
            )}
            <button className="aeRefresh" disabled={busy || mine == null} onClick={() => setOne(def, true)}>
              {has && def.kind === 'race_winner' ? 'Сменить место' : 'Выдать'}
            </button>
            {has && <button className="aeRefresh" disabled={busy} onClick={() => setOne(def, false)}>Снять</button>}
          </div>
        )
      })}
    </div>
  )
}
