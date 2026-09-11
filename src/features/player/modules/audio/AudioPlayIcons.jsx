import { Play, Pause } from 'lucide-react'

// Значки кнопки. Цвет тут жёстко тёмный: кнопка и в лаймовом, и в сером
// (на паузе) состоянии остаётся светлой подложкой под тёмным знаком
export function PlayTriangle() {
  return <Play size={10} fill="#0e1013" color="#0e1013" />
}
export function PauseIcon() {
  return <Pause size={10} fill="#0e1013" color="#0e1013" />
}
