import { useMemo, useState } from 'react'
import SlideMedia from '../SlideMedia.jsx'
import SandboxBar from './SandboxBar.jsx'
import { useFeedScene } from '../useFeedScene.js'
import { feedTaskOf } from '../sceneTaskPlay.js'
import { setForcedSceneTask } from '../sceneTaskLimits.js'
import { SANDBOX_ID, clearSandbox } from './feedSandbox.js'

// Заглушка, если сцена песочницы не прошла проверку или запись пропала (стор отдал 'invalid' / 'missing')
const BAD = <div className="sbxBad">Сцена не прошла проверку — откройте её в сборщике и исправьте ошибки линтера</div>

// Слайд-песочница (тест сцены админа): ТОЛЬКО сцена (SlideMedia, как у обычного слайда — пауза, звук, задание «О чём
// диалог» / голосовое по обычным правилам) и плашка «ТЕСТ». Остальных слоёв FeedSlide здесь нет вовсе: фразы со спойлером,
// «Изучить фразу», HUD (лайк/закладка/репост/сложность/замедление), «Ловли слов» и «Помнишь?» — их не нужно «отключать»,
// компонент их просто не монтирует. «Показать задание ещё раз» выставляет принудительный показ и пересоздаёт медиа-слой
// (сцена играет с начала, после первого круга выезжает задание). Новая запись песочницы (sandboxAt) тоже пересоздаёт слой.
export default function SandboxSlide({
  module: mod, slideKey, active = false, near = false, tabVisible = true,
  soundOn, soundEverOn, onSoundOn, onSoundOff, onSoundBlocked, onLock,
}) {
  const [again, setAgain] = useState(0)
  const { scene } = useFeedScene(SANDBOX_ID, { enabled: active || near })
  const hasTask = useMemo(() => !!feedTaskOf(scene), [scene])
  const replay = () => { setForcedSceneTask(SANDBOX_ID); setAgain(n => n + 1) }
  return (
    <section className="feedSlide feedGrad0 feedSandbox" data-sandbox="1">
      <SlideMedia
        key={`${mod.sandboxAt}:${again}`}
        sceneId={SANDBOX_ID} videoUrl={null} posterUrl={null} slideKey={slideKey} moduleId={mod.id}
        active={active} near={near} tabVisible={tabVisible} soundOn={soundOn} soundEverOn={soundEverOn}
        onSoundOn={onSoundOn} onSoundOff={onSoundOff} onSoundBlocked={onSoundBlocked} fallback={BAD} onLock={onLock}
      />
      <div className="feedPauseGuard" aria-hidden="true" />
      <SandboxBar hasTask={hasTask} onClose={() => clearSandbox()} onAgain={replay} />
    </section>
  )
}
