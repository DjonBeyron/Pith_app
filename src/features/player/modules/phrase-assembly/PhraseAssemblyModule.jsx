import AnswerBubbles from '../AnswerBubbles.jsx'

// Ответы на «собери фразу» в ленте — общий вид пузырей (AnswerBubbles.jsx)
export default function PhraseAssemblyModule({ phraseState, rewardXp = 0 }) {
  return <AnswerBubbles bubbles={phraseState} rewardXp={rewardXp} />
}
