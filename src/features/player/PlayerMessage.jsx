import { resolveModule } from './modules/index.js'

export default function PlayerMessage({ node, file, teacherName, photoChoiceState, wordChoiceState, phraseState, phraseHint, bottomOffset, onDone }) {
  const Module = resolveModule(node.type)
  if (!Module) return null
  return <Module node={node} file={file} teacherName={teacherName} photoChoiceState={photoChoiceState} wordChoiceState={wordChoiceState} phraseState={phraseState} phraseHint={phraseHint} bottomOffset={bottomOffset} onDone={onDone} />
}
