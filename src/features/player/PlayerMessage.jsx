import { resolveModule } from './modules/index.js'

export default function PlayerMessage({ node, file, teacherName, photoChoiceState, onDone }) {
  const Module = resolveModule(node.type)
  if (!Module) return null
  return <Module node={node} file={file} teacherName={teacherName} photoChoiceState={photoChoiceState} onDone={onDone} />
}
