import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  MessageSquare, Mic, PlayCircle, Video, Image, Smile,
  Info, Pin, SpellCheck, Layers, Images, MicVocal,
} from 'lucide-react'

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
  { value: 'photo_choice',    label: 'Выбрать фото',        icon: Images,        color: '#2a94b4' },
  { value: 'voice_record',    label: 'Запись голоса',       icon: MicVocal,      color: '#a84a84' },
]

export const TYPE_COLOR = Object.fromEntries(NODE_TYPES.map(t => [t.value, t.color]))

export default function NodeTypeSelect({ value, onChange, compact = false }) {
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const current = NODE_TYPES.find(t => t.value === value) ?? NODE_TYPES[0]
  const Icon = current.icon

  function openList(e) {
    e.stopPropagation()
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 3, left: r.left, width: Math.max(r.width, 200) })
  }

  function closeList() { setPos(null) }

  function pick(val, e) {
    e.stopPropagation()
    closeList()
    if (val !== value) onChange(val)
  }

  return (
    <div
      className={compact ? 'nodeTypeSelect nodeTypeSelectCompact' : 'nodeTypeSelect'}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        className="nodeTypeSelectTrigger"
        style={{ borderColor: current.color, color: current.color }}
        onClick={openList}
      >
        <Icon size={compact ? 10 : 12} />
        <span className="nodeTypeSelectLabel">{current.label}</span>
        <span className="nodeTypeSelectArrow" style={{ opacity: 0.5 }}>▾</span>
      </button>

      {pos && createPortal(
        <>
          {/* backdrop escapes any CSS transform on canvas ancestors */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onMouseDown={e => { e.stopPropagation(); closeList() }}
          />
          <div
            className="nodeTypeSelectList"
            style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 }}
            onMouseDown={e => e.stopPropagation()}
          >
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
        </>,
        document.body
      )}
    </div>
  )
}
