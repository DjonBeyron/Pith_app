import { useEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'

export default function TextModule({ node, onDone }) {
  useEffect(() => { onDone?.() }, []) // eslint-disable-line
  const content = node.typeData?.text?.content ?? ''
  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--text">
        <p className="playerText">
          {content || <span className="playerTextEmpty">Пустой текст</span>}
        </p>
      </PlayerBubble>
    </div>
  )
}
