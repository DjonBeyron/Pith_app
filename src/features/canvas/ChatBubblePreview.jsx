import HighlightedText from '../../shared/ui/HighlightedText.jsx'

// Пузырь «как придёт в чат» — один на оба окна ноды (раскраска и переносы),
// чтобы предпросмотр везде показывал одно и то же. Классы те же, что в
// плеере, поэтому шрифт, межстрочный и ширина совпадают с уроком, включая
// режим «пузырь по моим строкам» (hardWrap).
export default function ChatBubblePreview({ text, highlights = [], hardWrap = false }) {
  return (
    <div className={`playerMsgBubble playerMsgBubble--text${hardWrap ? ' playerMsgBubble--hardWrap' : ''}`}>
      <p className="playerText">
        {text.trim()
          ? <HighlightedText text={text} highlights={highlights} />
          : <span className="playerTextEmpty">пустое сообщение</span>}
      </p>
    </div>
  )
}
