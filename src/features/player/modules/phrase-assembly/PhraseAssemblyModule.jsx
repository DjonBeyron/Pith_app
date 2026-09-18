import AnswerBubbles from '../AnswerBubbles.jsx'
import { findReplyNode } from '../../replyResolve.js'

// Ответы на «собери фразу» в ленте — общий вид пузырей (AnswerBubbles.jsx).
// replyToSeq — своя цитата «В ответ на» у самой ноды (см. NodeContentEditor и
// lessonSchema): показывается над финальным пузырём ученика.
export default function PhraseAssemblyModule({ node, phraseState, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates }) {
  const replyNode = findReplyNode(node.typeData?.phrase_assembly?.replyToSeq, lessonNodes)
  return (
    <AnswerBubbles
      bubbles={phraseState}
      nodeId={node?.id ?? null}
      confetti={!node?.isHistory}
      replyNode={replyNode}
      lessonFiles={lessonFiles}
      teacherName={teacherName}
      allWordChoiceStates={allWordChoiceStates}
      allPhotoChoiceStates={allPhotoChoiceStates}
      allPhraseStates={allPhraseStates}
    />
  )
}
