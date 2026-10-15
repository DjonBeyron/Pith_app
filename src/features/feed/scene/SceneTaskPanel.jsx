import SceneTaskCover from './SceneTaskCover.jsx'
import { lazy, Suspense } from 'react'
import { taskPanelKind } from './sceneTaskPlay.js'

// Голосовая панель тянет микрофон и распознаватель (Vosk) — отдельный чанк; он подгружается заранее, на последней реплике круга (useSceneVoiceWarm)
const SceneVoicePanel = lazy(() => import('./SceneVoicePanel.jsx'))

// Выбор панели задания по виду (taskPanelKind): 'voice' — микрофон ('say' / 'repeat', SceneVoicePanel), иначе клавиатура ('translate',
// SceneTaskSheet внутри SceneTaskCover). Накрытие одно и то же — выезд снизу, --catch-cover-h, блокировка свайпа (onLock в useSceneTask).
// task — результат useSceneTask; apiRef / total — режиссёр сцены (голосовой панели нужно погасить озвучку по тапу на микрофон).
export default function SceneTaskPanel({ task, apiRef, total }) {
  const { info } = task
  if (taskPanelKind(info) === 'voice') {
    return (
      <SceneTaskCover open={task.open} onClosed={task.coverGone}>
        <Suspense fallback={null}><SceneVoicePanel task={task} apiRef={apiRef} total={total} /></Suspense>
      </SceneTaskCover>
    )
  }
  return (
    <SceneTaskCover
      open={task.open} onClosed={task.coverGone} {...task.state}
      prompt={info.prompt} lineText={info.line.text} hint={info.task.hint ?? ''} answer={info.answers[0]}
      onKey={task.press} onBackspace={task.backspace} onCheck={task.check} onGiveUp={task.giveUp}
      onLater={task.later} onFinish={task.finish} onReplay={task.replay}
    />
  )
}
