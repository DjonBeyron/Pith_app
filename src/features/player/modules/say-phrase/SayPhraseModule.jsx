import AnswerBubbles from '../AnswerBubbles.jsx'

// «Сказать фразу» в ленте: САМ модуль в чат ничего не пишет — ни фразы, ни просьбы «Скажите вслух» (раньше был пузырь учителя;
// убран: задание ученику формулирует ПРЕДЫДУЩЕЕ сообщение автора, текстовая нода перед модулем, а панель поднимается сразу).
// Остаётся только ответ ученика — пузырь справа с эталонной фразой после успеха: общий вид AnswerBubbles.jsx (states.phraseStates),
// как у «Напечатай слово». Нода сама не «играет» и onDone не зовёт: ответом управляет панель (panels/say-phrase),
// без неё лента не пойдёт дальше. Старое поле showPhrase в данных ноды безопасно игнорируется.
export default function SayPhraseModule({
  node, phraseState, lessonFiles = [], teacherName,
  allWordChoiceStates, allPhotoChoiceStates, allPhraseStates,
}) {
  return (
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
  )
}
