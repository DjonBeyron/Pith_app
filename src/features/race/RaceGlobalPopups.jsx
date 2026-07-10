import { useState, useEffect } from 'react'
import { fetchCurrentRace, fetchMyEntry, finalizeRace, fetchRaceResults } from '../../shared/api/raceApi.js'
import { racePhase, weekKey, MODULE_DONE_WEEK_KEY } from './useRaceState.js'
import RaceAnnouncePopup from './RaceAnnouncePopup.jsx'
import RaceResultsPopup from './RaceResultsPopup.jsx'
import { useAuth } from '../../shared/lib/useAuth.js'
import { dbg } from '../../shared/lib/debug.js'

const ANNOUNCE_SEEN_KEY = 'pithy_race_announce_seen'
const RESULTS_SEEN_KEY  = 'pithy_race_results_seen' // + '_<raceId>'

// Глобальные попапы супергонки (живут в ShellV2 поверх вкладок):
// 1) анонс — раз в неделю, после первого пройденного модуля на неделе;
// 2) итоги — участнику после окончания гонки (подиум 1-2-3 + своё место).
export default function RaceGlobalPopups({ onOpenRace }) {
  const [announce, setAnnounce] = useState(null) // race
  const [results,  setResults]  = useState(null) // { race, rows }
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    let cancelled = false
    ;(async () => {
      const race = await fetchCurrentRace()
      if (!race || cancelled) { dbg('[RACE-POPUP] гонки нет — попапы не нужны'); return }
      const phase = racePhase(race)
      const resultsSeen = !!localStorage.getItem(`${RESULTS_SEEN_KEY}_${race.id}`)
      dbg('[RACE-POPUP] проверка: фаза', phase, '| юзер:', user ? 'есть' : 'гость',
        '| итоги видел:', resultsSeen)

      // Итоги: участник + гонка кончилась + ещё не видел
      if (phase === 'ended' && user && !resultsSeen) {
        const entry = await fetchMyEntry(race.id)
        if (entry?.finished_at && !cancelled) {
          await finalizeRace(race.id) // идемпотентно; первый клиент подводит итоги
          const rows = await fetchRaceResults(race.id)
          dbg('[RACE-POPUP] показ итогов:', rows.length ? `да (${rows.length} строк)` : 'нет строк')
          if (rows.length && !cancelled) { setResults({ race, rows }); return }
        } else {
          dbg('[RACE-POPUP] итоги не показываем: не финишировал')
        }
      }

      // Анонс: на этой неделе пройден модуль, попап недели ещё не показывали
      const wk = weekKey()
      const doneWk = localStorage.getItem(MODULE_DONE_WEEK_KEY)
      const seenWk = localStorage.getItem(ANNOUNCE_SEEN_KEY)
      dbg('[RACE-POPUP] анонс: неделя', wk, '| модуль пройден:', doneWk ?? '—',
        '| анонс показан:', seenWk ?? '—',
        '→', phase !== 'ended' && doneWk === wk && seenWk !== wk ? 'ПОКАЗЫВАЕМ' : 'нет')
      if (phase !== 'ended' && doneWk === wk && seenWk !== wk && !cancelled) {
        setAnnounce(race)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  if (results) {
    return (
      <RaceResultsPopup
        race={results.race}
        results={results.rows}
        myUserId={user?.id}
        onClose={() => {
          localStorage.setItem(`${RESULTS_SEEN_KEY}_${results.race.id}`, '1')
          setResults(null)
        }}
      />
    )
  }

  if (announce) {
    const close = () => {
      localStorage.setItem(ANNOUNCE_SEEN_KEY, weekKey())
      setAnnounce(null)
    }
    return (
      <RaceAnnouncePopup
        race={announce}
        onOpenRace={() => { close(); onOpenRace?.() }}
        onClose={close}
      />
    )
  }

  return null
}
