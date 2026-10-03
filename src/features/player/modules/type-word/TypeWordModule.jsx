import AnswerBubbles from '../AnswerBubbles.jsx'
import { findReplyNode } from '../../replyResolve.js'

// Ответы на «Напечатай слово» в ленте — тот же общий вид пузырей (AnswerBubbles.jsx),
// что у «Собери фразу» и «Составь предложение»: bubbles приходит через общий
// states.phraseStates, keyed по nodeId. replyToSeq — своя цитата «В ответ на».
export default function TypeWordModule({ node, phraseState, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates }) {
  const replyNode = findReplyNode(node.typeData?.type_word?.replyToSeq, lessonNodes)
  return (
    <AnswerBubbles
      bubbles={phraseState}
      nodeId={node?.id ?? null}
      /* салют даёт сама панель (TypeWordPanel, fireBurst при уходе) */
      confetti={false}
      replyNode={replyNode}
      lessonFiles={lessonFiles}
      teacherName={teacherName}
      allWordChoiceStates={allWordChoiceStates}
      allPhotoChoiceStates={allPhotoChoiceStates}
      allPhraseStates={allPhraseStates}
    />
  )
}
