import {
  MessageSquare, Mic, PlayCircle, Video, Image, Smile,
  Info, Pin, SpellCheck, Layers, Images, MicVocal, UserPlus, Table2,
} from 'lucide-react'

// Справочник типов нод канваса (вынесен из NodeTypeSelect.jsx: react-refresh
// требует, чтобы файл компонента экспортировал только компоненты).
export const NODE_TYPES = [
  { value: 'text',            label: 'Текстовое сообщение', icon: MessageSquare, color: '#7a7a96' },
  { value: 'audio',           label: 'Голосовое сообщение', icon: Mic,           color: '#6a9ec4' },
  { value: 'circle',          label: 'Видеосообщение',      icon: PlayCircle,    color: '#c47e7e' },
  { value: 'video',           label: 'Видео',               icon: Video,         color: '#9a7abc' },
  { value: 'photo',           label: 'Фото',                icon: Image,         color: '#6aaa6a' },
  { value: 'sticker',         label: 'Стикер',              icon: Smile,         color: '#c87850' },
  { value: 'system',          label: 'Системное сообщение', icon: Info,          color: '#6a7a8a' },
  { value: 'pin_message',     label: 'Закрепить сообщение', icon: Pin,           color: '#aa8830' },
  { value: 'word_choice',     label: 'Выбери слово',        icon: SpellCheck,    color: '#c89050' },
  { value: 'phrase_assembly', label: 'Собери фразу',        icon: Layers,        color: '#3a9888' },
  { value: 'table',           label: 'Таблица',             icon: Table2,        color: '#8a6fd4' },
  { value: 'photo_choice',    label: 'Выбрать фото',        icon: Images,        color: '#2a94b4' },
  { value: 'voice_record',    label: 'Запись голоса',       icon: MicVocal,      color: '#a84a84' },
  { value: 'registration',   label: 'Регистрация',          icon: UserPlus,      color: '#4a8ab4' },
]

export const TYPE_COLOR = Object.fromEntries(NODE_TYPES.map(t => [t.value, t.color]))

// Смешивает цвет типа с тёмной базой ноды (#12141a) вместо rgba-прозрачности,
// чтобы фон оставался тёмным независимо от того, что под ним. Общая для
// canvas (CanvasNode.jsx) и продакшен-списка (ProductionRow.jsx) — фон ноды
// должен выглядеть одинаково в обоих редакторах одних и тех же данных.
export function colorBg(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const br = 18, bg = 20, bb = 26  // #12141a
  return `rgb(${Math.round(br + (r - br) * alpha)},${Math.round(bg + (g - bg) * alpha)},${Math.round(bb + (b - bb) * alpha)})`
}
