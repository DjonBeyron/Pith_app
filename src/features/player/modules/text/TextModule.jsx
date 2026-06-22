import { useEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'

export default function TextModule({ node, lessonNodes = [], teacherName, onDone }) {
  useEffect(() => { onDone?.() }, []) // eslint-disable-line
  const content     = node.typeData?.text?.content ?? ''
  const replyToSeq  = node.typeData?.text?.replyToSeq
  const replyNode   = replyToSeq > 0 ? lessonNodes.find(n => n.seq === replyToSeq) : null
  const replyText   = replyNode ? (replyNode.typeData?.[replyNode.type]?.content ?? '') : ''

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--text">
        {replyNode && (
          <div className="playerReply">
            <span className="playerReplyName">{teacherName || 'Учитель'}</span>
            <p className="playerReplyText">{replyText || `#${replyNode.seq}`}</p>
          </div>
        )}
        <p className="playerText">
          {content || <span className="playerTextEmpty">Пустой текст</span>}
        </p>
      </PlayerBubble>
    </div>
  )
}
