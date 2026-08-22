import { APP_VERSION } from '../../shared/lib/version.js'
import XpFloat from './XpFloat.jsx'
import LessonSummary from './LessonSummary.jsx'
import { HINT_LIMIT } from './useFinalHints.js'

// Номер версии виден прямо в плеере: после деплоя сразу понятно, что открыт
// свежий код, а не кэш браузера (правило из CLAUDE.md)
function buildStamp() {
  const d = new Date(__BUILD_TIME__)
  const p = n => String(n).padStart(2, '0')
  return `${APP_VERSION}: ${p(d.getDate())}.${p(d.getMonth() + 1)}_${p(d.getHours())}.${p(d.getMinutes())}`
}

// Слои поверх чата: всплывающие «+N XP», экран итогов урока и штамп версии.
// Вынесены из LessonPlayer.jsx — он у потолка размера файла.
export default function PlayerOverlays({
  xpEvents, onDismissXp,
  showSummary, earnedXp, baseXp, ticket, stars, onSummaryClose,
}) {
  return (
    <>
      <XpFloat events={xpEvents} onDismiss={onDismissXp} />
      {showSummary && (
        <LessonSummary
          earnedXp={earnedXp}
          baseXp={baseXp}
          ticket={ticket}
          hintLimit={HINT_LIMIT}
          stars={stars}
          onClose={onSummaryClose}
        />
      )}
      <div className="playerVersionStamp">{buildStamp()}</div>
    </>
  )
}
