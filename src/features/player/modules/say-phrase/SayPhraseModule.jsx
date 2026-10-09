import { useMemo } from 'react'
import TextModule from '../text/TextModule.jsx'
import AnswerBubbles from '../AnswerBubbles.jsx'
import { sayPromptNode } from './sayPromptNode.js'

// «Сказать фразу» в ленте: вопрос — пузырь учителя с фразой и просьбой сказать вслух (+ перевод по кнопке),
// ответ ученика — тот же общий вид пузырей (AnswerBubbles.jsx, states.phraseStates), что у «Напечатай слово».
// Нода сама не «играет» и onDone не зовёт: ответом управляет панель (panels/say-phrase), без неё лента не пойдёт дальше.
export default function SayPhraseModule({
  node, phraseState, lessonNodes = [], lessonFiles = [], teacherName, onTrReveal,
  allWordChoiceStates, allPhotoChoiceStates, allPhraseStates,
}) {
  const raw = node.typeData?.say_phrase
  const phrase = String(raw?.phrase ?? '').trim()
  const translation = String(raw?.translation ?? '').trim()
  const promptNode = useMemo(() => (phrase ? sayPromptNode(node, { phrase, translation }) : null), [node, phrase, translation])
  return (
    <>
      {promptNode && (
        <TextModule
          node={promptNode}
          lessonNodes={lessonNodes}
          lessonFiles={lessonFiles}
          teacherName={teacherName}
          onTrReveal={onTrReveal}
        />
      )}
      <AnswerBubbles
        bubbles={phraseState}
        nodeId={node?.id ?? null}
        /* салют даёт сама панель (SayPhrasePanel, fireBurst при уходе) */
        confetti={false}
        lessonFiles={lessonFiles}
        teacherName={teacherName}
        allWordChoiceStates={allWordChoiceStates}
        allPhotoChoiceStates={allPhotoChoiceStates}
        allPhraseStates={allPhraseStates}
      />
    </>
  )
}
