import HighlightedText from '../../shared/ui/HighlightedText.jsx'
import { emojiOnlyInfo } from '../../shared/lib/emojiOnly.js'

// Пузырь «как придёт в чат» — один на оба окна ноды (раскраска и переносы),
// чтобы предпросмотр везде показывал одно и то же. Классы те же, что в
// плеере, поэтому шрифт, межстрочный и ширина совпадают с уроком, включая
// режим «пузырь по моим строкам» (hardWrap).
export default function ChatBubblePreview({ text, highlights = [], hardWrap = false }) {
  const emoji = !highlights.length ? emojiOnlyInfo(text) : { only: false, size: null }
  return (
    <div className={`playerMsgBubble playerMsgBubble--text${hardWrap ? ' playerMsgBubble--hardWrap' : ''}${emoji.only ? ' playerMsgBubble--emojiOnly' : ''}`}>
      <p className="playerText" style={emoji.size ? { fontSize: emoji.size, lineHeight: 1.2 } : undefined}>
        {text.trim()
          ? <HighlightedText text={text} highlights={highlights} />
          : <span className="playerTextEmpty">пустое сообщение</span>}
      </p>
    </div>
  )
}
