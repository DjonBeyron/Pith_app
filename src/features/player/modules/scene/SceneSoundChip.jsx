import { Volume2 } from 'lucide-react'

// Чип «Включить звук» поверх сцены: автозапуск пошёл без звука (на странице ещё не
// было жеста — политика автоплея), тап — жест, открывает звук и переигрывает
// реплику уже со звуком (useScenePlayback.enableSound). Общий для пузыря и кружка.
export default function SceneSoundChip({ onClick }) {
  return (
    <button type="button" className="playerSceneSoundChip" onClick={onClick} data-scene-sound-chip="">
      <Volume2 size={14} color="white" />
      <span>Включить звук</span>
    </button>
  )
}
