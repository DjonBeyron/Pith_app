import { useEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import ReplyPreview from '../../ReplyPreview.jsx'
import HighlightedText from '../../../../shared/ui/HighlightedText.jsx'

export default function TextModule({ node, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, onDone }) {
  useEffect(() => { onDone?.() }, []) // eslint-disable-line
  const content    = node.typeData?.text?.content ?? ''
  const highlights = node.typeData?.text?.highlights ?? []
  const replyToSeq = node.typeData?.text?.replyToSeq
  const replyNode  = replyToSeq > 0 ? lessonNodes.find(n => n.seq === replyToSeq) : null

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--text">
        {replyNode && (
          <ReplyPreview
            replyNode={replyNode}
            lessonFiles={lessonFiles}
            teacherName={teacherName}
            allWordChoiceStates={allWordChoiceStates}
            allPhotoChoiceStates={allPhotoChoiceStates}
            allPhraseStates={allPhraseStates}
          />
        )}
        <p className="playerText">
          {content
            ? <HighlightedText text={content} highlights={highlights} />
            : <span className="playerTextEmpty">Пустой текст</span>
          }
        </p>
      </PlayerBubble>
    </div>
  )
}
