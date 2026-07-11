import { useState, useEffect, useCallback } from 'react'
import {
  fetchCurrentRace, fetchMyEntry, fetchRaceModules, fetchMyCompletedLessonIds,
} from '../../shared/api/raceApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { dbg } from '../../shared/lib/debug.js'
import { subscribeRaceChanged } from './raceBus.js'

// Ключ localStorage: CurriculumView пишет сюда неделю, на которой пользователь
// прошёл модуль до конца — триггер попапа-анонса супергонки (RaceGlobalPopups).
export const MODULE_DONE_WEEK_KEY = 'pithy_module_done_week'

// Доля суммарного XP заданий, открывающая супергонку (80%).
export const RACE_UNLOCK_SHARE = 0.8

// Ключ текущей недели (понедельник — начало): для «раз в неделю» попапа анонса.
export function weekKey(d = new Date()) {
  const day = (d.getDay() + 6) % 7 // 0 = понедельник
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`
}

// Фаза гонки по серверным датам: none | upcoming | running | ended
export function racePhase(race, now = Date.now()) {
  if (!race?.starts_at || !race?.ends_at) return 'none'
  if (now < new Date(race.starts_at).getTime()) return 'upcoming'
  if (now <= new Date(race.ends_at).getTime()) return 'running'
  return 'ended'
}

// Состояние супергонки: гонка, модули-задания с прогрессом по урокам
// (сервер + локальные пометки), моя запись, XP-порог открытия (80% суммы).
export function useRaceState(active = true) {
  const [race,       setRace]       = useState(null)
  const [modules,    setModules]    = useState([]) // [{ id, title, lessons, xp, earnedXp, doneLessons, done }]
  const [raceModule, setRaceModule] = useState(null) // про-модуль — сам супер-урок
  const [myEntry,    setMyEntry]    = useState(null)
  const [loading,    setLoading]    = useState(true)

  const reload = useCallback(async () => {
    const r = await fetchCurrentRace()
    setRace(r)
    if (!r) { setModules([]); setRaceModule(null); setMyEntry(null); setLoading(false); return }

    const ids = Array.isArray(r.prep_module_ids) ? r.prep_module_ids : []
    const [mods, raceMods] = await Promise.all([
      fetchRaceModules(ids),
      r.race_module_id ? fetchRaceModules([r.race_module_id]) : Promise.resolve([]),
    ])
    setRaceModule(raceMods[0] ?? null)
    const allLessonIds = mods.flatMap(m => m.lessons.map(l => l.id))
    const [serverDone, entry] = await Promise.all([
      fetchMyCompletedLessonIds(allLessonIds),
      fetchMyEntry(r.id),
    ])
    const localDone = getCompletedLessons()
    const isDone = id => serverDone.has(id) || localDone.has(id)

    const merged = mods.map(m => {
      const doneLs = m.lessons.filter(l => isDone(l.id))
      return {
        ...m,
        doneLessons: doneLs.length,
        earnedXp: doneLs.reduce((s, l) => s + l.xp, 0),
        done: m.lessons.length > 0 && doneLs.length === m.lessons.length,
      }
    })
    dbg('[RACE] состояние:', `фаза ${racePhase(r)},`,
      'модули:', merged.map(m => `«${m.title}» ${m.earnedXp}/${m.xp}XP (${m.doneLessons}/${m.lessons.length})`).join(' | ') || 'нет')
    setModules(merged)
    setMyEntry(entry)
    setLoading(false)
  }, [])

  useEffect(() => { if (active) reload() }, [active, reload])

  // Админ удалил/изменил гонку в другой вкладке — баннер обновляется сразу,
  // без перезагрузки приложения (см. features/race/raceBus.js)
  useEffect(() => subscribeRaceChanged(reload), [reload])

  const totalXp  = modules.reduce((s, m) => s + m.xp, 0)
  const earnedXp = modules.reduce((s, m) => s + m.earnedXp, 0)
  const neededXp = Math.ceil(totalXp * RACE_UNLOCK_SHARE)
  const unlocked = totalXp > 0 && earnedXp >= neededXp

  return {
    race, modules, raceModule, myEntry, loading, reload,
    totalXp, earnedXp, neededXp, unlocked,
    phase: racePhase(race),
  }
}
