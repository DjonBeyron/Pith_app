import { useState, useRef } from 'react'
import LessonLaunchCard from '../lessons/LessonLaunchCard.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import EnergyPaywall from '../lessons/EnergyPaywall.jsx'
import { startLesson } from '../../shared/api/profileApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { dbg } from '../../shared/lib/debug.js'

// Прохождение супер-урока гонки: уроки про-модуля идут цепочкой один за
// другим (карточка прогрева → плеер → следующий), ошибки и время суммируются.
// XP и обычные итоги отключены (raceMode плеера) — всё решается после гонки.
export default function RaceRunner({ lessonIds = [], onRaceFinish, onClosed }) {
  const [idx,        setIdx]        = useState(0)
  const [playerData, setPlayerData] = useState(null)
  const [noEnergy,   setNoEnergy]   = useState(null)
  const totalsRef = useRef({ errors: 0, timeMs: 0 })

  const lessonId = lessonIds[idx]
  if (!lessonId) return null

  if (noEnergy) {
    return <EnergyPaywall nextAt={noEnergy.nextAt} onClose={() => { setNoEnergy(null); onClosed?.() }} />
  }

  if (!playerData) {
    return (
      <LessonLaunchCard
        key={lessonId}
        lessonId={lessonId}
        onStart={async (data) => {
          // Энергию решает сервер (новый урок → -1, пересдача бесплатно)
          const res = await startLesson(lessonId)
          if (res?.ok === false) { setNoEnergy({ nextAt: res.next_at }); return }
          refreshProfile()
          setPlayerData(data)
        }}
        onClose={() => onClosed?.()}
      />
    )
  }

  return (
    <LessonPlayer
      key={lessonId}
      nodes={playerData.nodes}
      files={playerData.files}
      lessonTitle={playerData.title}
      lessonXp={0} /* XP супер-урока отложен до итогов — плашки не летают */
      lessonId={lessonId}
      teacherName={playerData.teacherName}
      teacherLogo={playerData.teacherLogo}
      teacherLogoCrop={playerData.teacherLogoCrop}
      videoAutoSound={playerData.videoAutoSound ?? false}
      initialBlobMap={playerData.blobMap}
      onFinishStats={(s) => {
        totalsRef.current.errors += s.errors
        totalsRef.current.timeMs += s.timeMs
        dbg('[RACE] урок', idx + 1, 'из', lessonIds.length,
          '— ошибок', s.errors, ', время', Math.round(s.timeMs / 1000), 'сек; всего:',
          totalsRef.current.errors, 'ошибок,', Math.round(totalsRef.current.timeMs / 1000), 'сек')
      }}
      onSummaryClose={() => {
        // Плеер зовёт это сам после финиша (raceMode, обычных итогов нет)
        if (idx + 1 < lessonIds.length) {
          setPlayerData(null)
          setIdx(idx + 1)
        } else {
          onRaceFinish?.(totalsRef.current)
        }
      }}
      onClose={() => onClosed?.()} /* выход крестиком — прерывание, попытка не сгорает */
    />
  )
}
