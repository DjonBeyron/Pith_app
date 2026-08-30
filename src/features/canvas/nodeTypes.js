import {
  MessageSquare, Mic, PlayCircle, Video, Image, Smile,
  Info, Pin, SpellCheck, Layers, Images, MicVocal, UserPlus, Table2, SmilePlus,
} from 'lucide-react'

// Справочник типов нод канваса (вынесен из NodeTypeSelect.jsx: react-refresh
// требует, чтобы файл компонента экспортировал только компоненты).
// group — для группировки в выпадающем меню выбора типа (см. isGroupStart
// ниже): 'content' — обычная доставка сообщения, 'interactive' — нода с
// проверкой ответа пользователя.
export const NODE_TYPES = [
  { value: 'text',            label: 'Текстовое сообщение', icon: MessageSquare, color: '#7a7a96', group: 'content' },
  { value: 'audio',           label: 'Голосовое сообщение', icon: Mic,           color: '#6a9ec4', group: 'content' },
  { value: 'circle',          label: 'Видеосообщение',      icon: PlayCircle,    color: '#c47e7e', group: 'content' },
  { value: 'video',           label: 'Видео',               icon: Video,         color: '#9a7abc', group: 'content' },
  { value: 'photo',           label: 'Фото',                icon: Image,         color: '#6aaa6a', group: 'content' },
  { value: 'sticker',         label: 'Стикер',              icon: Smile,         color: '#c87850', group: 'content' },
  { value: 'reaction',        label: 'Реакция на сообщение', icon: SmilePlus,    color: '#c85a8a', group: 'content' },
  { value: 'system',          label: 'Системное сообщение', icon: Info,          color: '#6a7a8a', group: 'content' },
  { value: 'pin_message',     label: 'Закрепить сообщение', icon: Pin,           color: '#aa8830', group: 'content' },
  { value: 'word_choice',     label: 'Выбери слово',        icon: SpellCheck,    color: '#c89050', group: 'interactive' },
  { value: 'phrase_assembly', label: 'Собери фразу',        icon: Layers,        color: '#3a9888', group: 'interactive' },
  { value: 'table',           label: 'Таблица',             icon: Table2,        color: '#8a6fd4', group: 'interactive' },
  { value: 'photo_choice',    label: 'Выбрать фото',        icon: Images,        color: '#2a94b4', group: 'interactive' },
  { value: 'voice_record',    label: 'Запись голоса',       icon: MicVocal,      color: '#a84a84', group: 'interactive' },
  { value: 'registration',   label: 'Регистрация',          icon: UserPlus,      color: '#4a8ab4', group: 'interactive' },
]

export const TYPE_COLOR = Object.fromEntries(NODE_TYPES.map(t => [t.value, t.color]))

// Короткие имена — для подписи на дальнем зуме. Полные («Текстовое сообщение»)
// туда не влезают: нода там шириной в палец, а подпись должна читаться целиком
export const TYPE_SHORT = {
  text: 'Текст', audio: 'Голос', circle: 'Кружок', video: 'Видео', photo: 'Фото',
  sticker: 'Стикер', reaction: 'Реакция', system: 'Система', pin_message: 'Закреп',
  word_choice: 'Слово', phrase_assembly: 'Фраза', table: 'Таблица',
  photo_choice: 'Фото-выбор', voice_record: 'Запись', registration: 'Регистрация',
}

// true для первого элемента новой группы (кроме самой первой) — используется
// в NodeTypeSelect.jsx/InsertNodeButton.jsx, чтобы отделить группы отступом
// в выпадающем меню выбора типа
export function isGroupStart(index) {
  return index > 0 && NODE_TYPES[index].group !== NODE_TYPES[index - 1].group
}

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
