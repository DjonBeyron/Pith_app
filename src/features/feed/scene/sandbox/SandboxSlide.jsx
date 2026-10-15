import { useEffect, useMemo, useState } from 'react'
import SlideMedia from '../SlideMedia.jsx'
import SandboxBar from './SandboxBar.jsx'
import { useFeedScene } from '../useFeedScene.js'
import { feedTaskOf } from '../sceneTaskPlay.js'
import { setForcedSceneTask } from '../sceneTaskLimits.js'
import { SANDBOX_ID, clearSandbox } from './feedSandbox.js'
import { sandboxTask, useSandboxTask, taskStatusText } from './sandboxTaskStatus.js'
import { requestOpenSceneBuilder } from '../../../../shared/lib/openSceneBuilderEvent.js'

// Заглушка, если сцена песочницы не прошла проверку или запись пропала (стор отдал 'invalid' / 'missing')
const BAD = <div className="sbxBad">Сцена не прошла проверку — откройте её в сборщике и исправьте ошибки линтера</div>

// Слайд-песочница (тест сцены админа): ТОЛЬКО сцена (SlideMedia, как у обычного слайда — пауза, звук, задание «О чём
// диалог» / голосовое по обычным правилам) и плашка «ТЕСТ». Остальных слоёв FeedSlide здесь нет вовсе: фразы со спойлером,
// «Изучить фразу», HUD (лайк/закладка/репост/сложность/замедление), «Ловли слов» и «Помнишь?» — их не нужно «отключать»,
// компонент их просто не монтирует. «Показать задание ещё раз» выставляет принудительный показ и пересоздаёт медиа-слой
// (сцена играет с начала, задание выезжает сразу после первого полного проигрывания). Новая запись песочницы (sandboxAt) тоже пересоздаёт слой.
// Принудительный показ записи (taskForce) взводится заново при каждом монтировании слоя: он одноразовый (снимается при показе),
// а слайд могли пересобрать. Строка статуса задания (sandboxTaskStatus) говорит админу, что происходит и почему задание пропущено.
// Два макета (sbxStubPhrase / sbxStubLearn) держат нижнюю раскладку кадра сцены такой же, как в боевой ленте — чтобы панель задания и её уход оценивались на честном фоне.
// «← Вернуться в сборщик» — просьба открыть сборщик админки с тем же черновиком (openSceneBuilderEvent.js).
export default function SandboxSlide({
  module: mod, slideKey, active = false, near = false, tabVisible = true,
  soundOn, soundEverOn, onSoundOn, onSoundOff, onSoundBlocked, onLock,
}) {
  const [again, setAgain] = useState(0)
  const { scene } = useFeedScene(SANDBOX_ID, { enabled: active || near })
  const info = useMemo(() => feedTaskOf(scene), [scene])
  const status = useSandboxTask()
  useEffect(() => {
    if (mod.taskForce) setForcedSceneTask(SANDBOX_ID)
    return () => sandboxTask.reset()
  }, [mod.sandboxAt, mod.taskForce])
  const replay = () => { setForcedSceneTask(SANDBOX_ID); sandboxTask.reset(); setAgain(n => n + 1) }
  const back = () => requestOpenSceneBuilder({ from: 'sandbox', origin: mod.origin, scene: mod.origin === 'admin' ? null : scene })
  return (
    <section className="feedSlide feedGrad0 feedSandbox" data-sandbox="1">
      <SlideMedia
        key={`${mod.sandboxAt}:${again}`}
        sceneId={SANDBOX_ID} videoUrl={null} posterUrl={null} slideKey={slideKey} moduleId={mod.id}
        active={active} near={near} tabVisible={tabVisible} soundOn={soundOn} soundEverOn={soundEverOn}
        onSoundOn={onSoundOn} onSoundOff={onSoundOff} onSoundBlocked={onSoundBlocked} fallback={BAD} onLock={onLock}
      />
      <div className="feedPauseGuard" aria-hidden="true" />
      {/* Макеты нижних слоёв боевой ленты (блок фразы и кнопка урока) тех же размеров и мест: без них под котами голая полоса цвета
          пола, а когда панель задания уезжает, внизу «пустота». Не кликаются; гаснут под панелью (feed-sandbox.css) */}
      <div className="sbxStubPhrase" aria-hidden="true">Здесь в ленте стоит фраза урока</div>
      <div className="sbxStubLearn" aria-hidden="true">Здесь кнопка урока</div>
      <SandboxBar
        hasTask={!!info} status={scene ? taskStatusText({ task: scene.task, info, status }) : null}
        onClose={() => clearSandbox()} onAgain={replay} onBack={back}
      />
    </section>
  )
}
