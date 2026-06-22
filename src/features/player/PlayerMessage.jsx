import { resolveModule } from './modules/index.js'

export default function PlayerMessage({ node, file, lessonFiles, lessonNodes, teacherName, photoChoiceState, wordChoiceState, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, phraseState, bottomOffset, onDone }) {
  const Module = resolveModule(node.type)
  if (!Module) return null
  return <Module node={node} file={file} lessonFiles={lessonFiles} lessonNodes={lessonNodes} teacherName={teacherName} photoChoiceState={photoChoiceState} wordChoiceState={wordChoiceState} allWordChoiceStates={allWordChoiceStates} allPhotoChoiceStates={allPhotoChoiceStates} allPhraseStates={allPhraseStates} phraseState={phraseState} bottomOffset={bottomOffset} onDone={onDone} />
}
