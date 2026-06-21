import { resolveModule } from './modules/index.js'

export default function PlayerMessage({ node, file, teacherName, photoChoiceState, wordChoiceState, phraseState, bottomOffset, onDone }) {
  const Module = resolveModule(node.type)
  if (!Module) return null
  return <Module node={node} file={file} teacherName={teacherName} photoChoiceState={photoChoiceState} wordChoiceState={wordChoiceState} phraseState={phraseState} bottomOffset={bottomOffset} onDone={onDone} />
}
