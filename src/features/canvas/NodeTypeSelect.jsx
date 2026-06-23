import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare, Mic, PlayCircle, Video, Image, Smile,
  Info, Pin, SpellCheck, Layers, Images, MicVocal,
} from 'lucide-react'

export const NODE_TYPES = [
  { value: 'text',            label: 'Текстовое сообщение', icon: MessageSquare, color: '#55556a' },
  { value: 'audio',           label: 'Голосовое сообщение', icon: Mic,           color: '#4a7ca8' },
  { value: 'circle',          label: 'Видеосообщение',      icon: PlayCircle,    color: '#c06a6a' },
  { value: 'video',           label: 'Видео',               icon: Video,         color: '#7a5a9a' },
  { value: 'photo',           label: 'Фото',                icon: Image,         color: '#5a9a5a' },
  { value: 'sticker',         label: 'Стикер',              icon: Smile,         color: '#c05830' },
  { value: 'system',          label: 'Системное сообщение', icon: Info,          color: '#4a5568' },
  { value: 'pin_message',     label: 'Закрепить сообщение', icon: Pin,           color: '#8b6914' },
  { value: 'word_choice',     label: 'Выбери слово',        icon: SpellCheck,    color: '#b07030' },
  { value: 'phrase_assembly', label: 'Собери фразу',        icon: Layers,        color: '#2a8070' },
  { value: 'photo_choice',    label: 'Выбрать фото',        icon: Images,        color: '#0e7490' },
  { value: 'voice_record',    label: 'Запись голоса',       icon: MicVocal,      color: '#8b3a6a' },
]

export const TYPE_COLOR = Object.fromEntries(NODE_TYPES.map(t => [t.value, t.color]))

// compact=true → mini node view (icon + short label, smaller trigger)
export default function NodeTypeSelect({ value, onChange, compact = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = NODE_TYPES.find(t => t.value === value) ?? NODE_TYPES[0]
  const Icon = current.icon

  useEffect(() => {
    if (!open) return
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function pick(val, e) {
    e.stopPropagation()
    setOpen(false)
    if (val !== value) onChange(val)
  }

  return (
    <div
      ref={ref}
      className={compact ? 'nodeTypeSelect nodeTypeSelectCompact' : 'nodeTypeSelect'}
      onClick={e => e.stopPropagation()}
    >
      <button
        className="nodeTypeSelectTrigger"
        style={{ borderColor: current.color, color: current.color }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
      >
        <Icon size={compact ? 10 : 12} />
        <span className="nodeTypeSelectLabel">{current.label}</span>
        <span className="nodeTypeSelectArrow" style={{ opacity: 0.5 }}>▾</span>
      </button>

      {open && (
        <div className={compact ? 'nodeTypeSelectList nodeTypeSelectListCompact' : 'nodeTypeSelectList'}>
          {NODE_TYPES.map(t => {
            const TIcon = t.icon
            const active = t.value === value
            return (
              <button
                key={t.value}
                className={'nodeTypeSelectItem' + (active ? ' nodeTypeSelectItemActive' : '')}
                style={{ background: `${t.color}26` }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => pick(t.value, e)}
              >
                <TIcon size={12} color={t.color} style={{ flexShrink: 0 }} />
                <span style={{ color: active ? '#fff' : '#ccc' }}>{t.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
