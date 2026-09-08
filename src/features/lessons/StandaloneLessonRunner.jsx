import { useState } from 'react'
import LessonLaunchCard from './LessonLaunchCard.jsx'
import EnergyPaywall from './EnergyPaywall.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import { startLesson } from '../../shared/api/profileApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { markLessonCompleted } from '../../shared/lib/completedLessons.js'

// Урок БЕЗ модуля вокруг — для перехода по ноде-ссылке (lesson_ref, канвас)
// и для закладки на отдельный урок в «Мои уроки» (MyLessons.jsx). В отличие
// от CurriculumView.jsx: без карты уроков, финального билета и приоритетов
// анализа — просто запуск (с обычной проверкой энергии) и честное
// завершение своим набором наград (XP + звёзды), выход всегда наружу через
// onExit, а не в чей-то модуль.
export default function StandaloneLessonRunner({ lessonId, onExit }) {
  const [playerData, setPlayerData] = useState(null)
  const [noEnergy,   setNoEnergy]   = useState(null)

  async function handleStart(data) {
    const res = await startLesson(lessonId)
    if (res?.ok === false) { setNoEnergy({ nextAt: res.next_at }); return }
    refreshProfile()
    setPlayerData(data)
  }

  if (playerData) {
    return (
      <LessonPlayer
        nodes={playerData.nodes}
        files={playerData.files}
        lessonTitle={playerData.title}
        lessonXp={playerData.lessonXp ?? 0}
        lessonId={lessonId}
        teacherName={playerData.teacherName}
        teacherLogo={playerData.teacherLogo}
        teacherLogoCrop={playerData.teacherLogoCrop}
        videoAutoSound={playerData.videoAutoSound ?? false}
        initialBlobMap={playerData.blobMap}
        starsEligible
        onClose={onExit}
        onSummaryClose={() => { markLessonCompleted(lessonId); onExit() }}
      />
    )
  }

  return (
    <>
      <LessonLaunchCard lessonId={lessonId} onStart={handleStart} onClose={onExit} />
      {noEnergy && (
        <EnergyPaywall nextAt={noEnergy.nextAt} onClose={() => { setNoEnergy(null); onExit() }} />
      )}
    </>
  )
}
