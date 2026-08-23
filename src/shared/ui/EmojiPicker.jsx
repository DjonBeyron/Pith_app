import { useState } from 'react'
import { createPortal } from 'react-dom'
import { EMOJI_GROUPS } from '../lib/emojiSet.js'

// Окно смайликов для текстовых полей редактора. Символы — стандартный Unicode
// (см. emojiSet.js), поэтому ничего не грузится и всё рисует шрифт системы.
//
// Порталом в body: окно открывается из ноды канваса, а её родители двигаются
// и масштабируются вместе с холстом — внутри такого поддерева абсолютные
// координаты уехали бы вместе с ним.
export default function EmojiPicker({ anchorRect, onPick, onClose }) {
  const [groupId, setGroupId] = useState(EMOJI_GROUPS[0].id)
  const group = EMOJI_GROUPS.find(g => g.id === groupId) ?? EMOJI_GROUPS[0]

  const width = 288
  const left = Math.min(Math.max(8, anchorRect?.left ?? 8), window.innerWidth - width - 8)
  const openUp = (anchorRect?.bottom ?? 0) > window.innerHeight - 320
  const pos = openUp
    ? { bottom: window.innerHeight - (anchorRect?.top ?? 0) + 6 }
    : { top: (anchorRect?.bottom ?? 0) + 6 }

  return createPortal(
    <>
      <div className="emojiOverlay" onMouseDown={onClose} />
      <div className="emojiPicker" style={{ left, width, ...pos }} onMouseDown={e => e.stopPropagation()}>
        <div className="emojiTabs">
          {EMOJI_GROUPS.map(g => (
            <button
              key={g.id}
              className={`emojiTab${g.id === groupId ? ' emojiTabOn' : ''}`}
              title={g.title}
              onClick={() => setGroupId(g.id)}
            >{g.items[0]}</button>
          ))}
        </div>
        <div className="emojiGrid">
          {group.items.map(ch => (
            <button key={ch} className="emojiItem" onClick={() => onPick(ch)}>{ch}</button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}
