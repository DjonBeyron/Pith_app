import { resolveModule } from './modules/index.js'

export default function PlayerMessage({ node, file, lessonFiles, lessonNodes, teacherName, photoChoiceState, wordChoiceState, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, phraseState, regState, bottomOffset, videoAutoSound, onDone, photoXpPending, onPhotoXpFired, rewardXp }) {
  const Module = resolveModule(node.type)
  if (!Module) return null
  return <Module node={node} file={file} lessonFiles={lessonFiles} lessonNodes={lessonNodes} teacherName={teacherName} photoChoiceState={photoChoiceState} wordChoiceState={wordChoiceState} allWordChoiceStates={allWordChoiceStates} allPhotoChoiceStates={allPhotoChoiceStates} allPhraseStates={allPhraseStates} phraseState={phraseState} regState={regState} bottomOffset={bottomOffset} videoAutoSound={videoAutoSound} onDone={onDone} photoXpPending={photoXpPending} onPhotoXpFired={onPhotoXpFired} rewardXp={rewardXp} />
}
