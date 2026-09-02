/* eslint-disable react-hooks/static-components --
   Module берётся из СТАТИЧНОЙ карты modules/index.js по типу ноды: ссылка
   стабильна между рендерами, это не создание компонента в рендере */
import { resolveModule } from './modules/index.js'

export default function PlayerMessage({ node, file, lessonFiles, lessonNodes, teacherName, photoChoiceState, wordChoiceState, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, phraseState, regState, tableSent, tableArriving, bottomOffset, videoAutoSound, adminPreview, pending, onDone, onTrReveal, photoXpPending, onPhotoXpFired, rewardXp, onXpEarned }) {
  const Module = resolveModule(node.type)
  if (!Module) return null
  return <Module node={node} file={file} lessonFiles={lessonFiles} lessonNodes={lessonNodes} teacherName={teacherName} photoChoiceState={photoChoiceState} wordChoiceState={wordChoiceState} allWordChoiceStates={allWordChoiceStates} allPhotoChoiceStates={allPhotoChoiceStates} allPhraseStates={allPhraseStates} phraseState={phraseState} regState={regState} tableSent={tableSent} tableArriving={tableArriving} bottomOffset={bottomOffset} videoAutoSound={videoAutoSound} adminPreview={adminPreview} pending={pending} onDone={onDone} onTrReveal={onTrReveal} photoXpPending={photoXpPending} onPhotoXpFired={onPhotoXpFired} rewardXp={rewardXp} onXpEarned={onXpEarned} />
}
