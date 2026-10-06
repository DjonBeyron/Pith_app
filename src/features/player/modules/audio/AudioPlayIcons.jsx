import { Play, Pause } from 'lucide-react'

// Значки кнопки. Цвет тут жёстко тёмный: кнопка и в лаймовом, и в сером
// (на паузе) состоянии остаётся светлой подложкой под тёмным знаком
export function PlayTriangle() {
  return <Play size={10} fill="#0e1013" color="#0e1013" />
}
export function PauseIcon() {
  return <Pause size={10} fill="#0e1013" color="#0e1013" />
}

// Кольцо загрузки вместо ▶: файл ещё не скачан прогревом или звук
// буферизует. Крутится через CSS (.playerAudioRing, audio.css)
export function LoadRing() {
  return (
    <svg className="playerAudioRing" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="#0e1013" strokeWidth="2.2" strokeOpacity="0.25" />
      <circle cx="10" cy="10" r="7" fill="none" stroke="#0e1013" strokeWidth="2.2" strokeLinecap="round"
        strokeDasharray="14 30" />
    </svg>
  )
}
