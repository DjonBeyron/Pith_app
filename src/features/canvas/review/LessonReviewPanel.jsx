import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { fromCanvasNodes, lintLesson } from '../lesson-io/lessonLint.js'
import { useLessonRules } from '../lesson-io/useLessonRules.js'
import { buildTranscript, warningsByRef } from './lessonTranscript.js'
import FeedItem from './FeedItem.jsx'
import NodeFacts from './NodeFacts.jsx'
import RulesPane from './RulesPane.jsx'

// «Разбор урока» — окно на весь экран ПК: слева вся история чата сразу (с переключением веток «верно / неверно» на заданиях),
// посередине нода в фокусе со всеми параметрами, справа замечания и правила. Только чтение (редактор ноды — следующий этап).
export default function LessonReviewPanel({ nodes: canvasNodes, onClose }) {
  const nodes = useMemo(() => fromCanvasNodes(canvasNodes), [canvasNodes])
  const [choices, setChoices] = useState({})
  const [selRef, setSelRef] = useState(null)
  const { rules, busy, addFull } = useLessonRules()

  const items = useMemo(() => buildTranscript(nodes, choices), [nodes, choices])
  const warnMap = useMemo(() => warningsByRef(lintLesson(nodes), nodes), [nodes])
  const sel = nodes.find(n => n.ref === selRef) ?? null
  const switched = Object.keys(choices).length

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setChoice = (ref, v) => setChoices(c => { const n = { ...c }; if (v === 'wrong') n[ref] = 'wrong'; else delete n[ref]; return n })
  const shownRefs = new Set(items.filter(i => i.kind === 'node').map(i => i.ref))

  return createPortal(
    <div className="rvwFull" onMouseDown={e => e.stopPropagation()}>
      <div className="rvwTop">
        <button className="rvwBack" onClick={onClose}>← Назад</button>
        <span className="rvwTitle">Разбор урока</span>
        <span className="rvwInfo">в ленте {shownRefs.size} из {nodes.length} нод{switched ? ` · веток «неверно»: ${switched}` : ''}</span>
        {switched > 0 && <button className="rvwBtn" onClick={() => setChoices({})}>Сбросить ветки</button>}
      </div>
      <div className="rvwCols">
        <div className="rvwFeed">
          {items.map((it, i) => (
            <FeedItem key={`${it.kind}-${it.ref}-${i}`} item={it} selected={it.ref === selRef} warnCount={warnMap.get(it.ref)?.length ?? 0} onSelect={setSelRef} onChoice={setChoice} />
          ))}
          {!items.length && <div className="rvwEmpty">В уроке нет нод</div>}
        </div>
        <div className="rvwCard"><NodeFacts node={sel} nodes={nodes} warnings={sel ? warnMap.get(sel.ref) ?? [] : []} /></div>
        <div className="rvwRight"><RulesPane node={sel} warnings={sel ? warnMap.get(sel.ref) ?? [] : []} rules={rules} busy={busy} onAdd={addFull} /></div>
      </div>
    </div>,
    document.body,
  )
}
