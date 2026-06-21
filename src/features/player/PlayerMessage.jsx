import { resolveModule } from './modules/index.js'

export default function PlayerMessage({ node, file, teacherName, photoChoiceState, wordChoiceState, onDone }) {
  const Module = resolveModule(node.type)
  if (!Module) return null
  return <Module node={node} file={file} teacherName={teacherName} photoChoiceState={photoChoiceState} wordChoiceState={wordChoiceState} onDone={onDone} />
}
