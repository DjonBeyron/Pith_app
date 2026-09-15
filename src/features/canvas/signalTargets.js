// Множество id нод, на которые ссылается ХОТЬ ОДИН сигнал ошибки (signals[]
// у table/phrase_assembly) где-либо в уроке — используется, чтобы покрасить
// шапку такой ноды красным на холсте (CanvasNode.jsx), независимо от её
// собственного типа: автор должен с первого взгляда видеть, какие ноды
// работают как «сигнал», а не часть обычного потока графа.
export function collectSignalTargetIds(nodes) {
  const ids = new Set()
  for (const n of nodes ?? []) {
    const signals = n.typeData?.[n.type]?.signals
    for (const s of signals ?? []) {
      if (s?.ref) ids.add(s.ref)
    }
  }
  return ids
}
