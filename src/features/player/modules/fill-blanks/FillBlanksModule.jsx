import AnswerBubbles from '../AnswerBubbles.jsx'
import { findReplyNode } from '../../replyResolve.js'

// Ответы на «Составь предложение» в ленте — тот же общий вид пузырей
// (AnswerBubbles.jsx), что у «Собери фразу» и таблицы: bubbles приходит через
// общий states.phraseStates, keyed по nodeId (nodeId уникален вне зависимости
// от типа ноды, поэтому расширять этот стор на третий тип безопасно — см.
// usePlayerAnswers.js/handlePhraseAnswer). replyToSeq — своя цитата «В ответ
// на» у самой ноды (см. NodeContentEditor и lessonSchema), как у text/sticker/
// phrase_assembly.
export default function FillBlanksModule({ node, phraseState, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates }) {
  const replyNode = findReplyNode(node.typeData?.fill_blanks?.replyToSeq, lessonNodes)
  return (
    <AnswerBubbles
      bubbles={phraseState}
      nodeId={node?.id ?? null}
      replyNode={replyNode}
      lessonFiles={lessonFiles}
      teacherName={teacherName}
      allWordChoiceStates={allWordChoiceStates}
      allPhotoChoiceStates={allPhotoChoiceStates}
      allPhraseStates={allPhraseStates}
    />
  )
}
