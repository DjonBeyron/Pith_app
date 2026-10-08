import AudioGlow from './AudioGlow.jsx'
import { useEqualizerEnabled } from './lessonPrefs.js'

// Свечение-эквалайзер снизу чата — за настройкой «Эквалайзер» из шестерёнки
// (lessonPrefs.js). Выключено — AudioGlow не монтируется вообще: нет canvas,
// нет подписки на уровень, поэтому общий rAF-цикл (audioLevel.js) не
// запускается. Вынесено отдельным компонентом, чтобы не раздувать LessonPlayer
export default function AudioGlowGate() {
  return useEqualizerEnabled() ? <AudioGlow /> : null
}
