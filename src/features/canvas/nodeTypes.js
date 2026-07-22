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
