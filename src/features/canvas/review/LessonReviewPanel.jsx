import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fromCanvasNodes, lintLesson } from '../lesson-io/lessonLint.js'
import { useLessonRules } from '../lesson-io/useLessonRules.js'
import { buildTranscript, warningsByRef } from './lessonTranscript.js'
import { diffNodes } from './applyChanges.js'
import PlayerLikeFeed from './PlayerLikeFeed.jsx'
import EmbeddedCanvas from './EmbeddedCanvas.jsx'
import RulesPane from './RulesPane.jsx'

// «Разбор урока» — окно на весь экран ПК: слева копия ленты плеера (вся история сразу, на заданиях переключатель веток «верно / неверно»),
// посередине полноценный холст, сфокусированный на выбранной ноде (редактируешь как обычно), справа замечания и правила.
// Холст здесь — СВОЯ копия нод: правки попадают в основной урок только по кнопке «Применить».
export default function LessonReviewPanel({ nodes: initialNodes, zones: initialZones, boardApiRef, boardProps, onClose }) {
  const [draft, setDraft] = useState(initialNodes)
  const [base, setBase] = useState(initialNodes) // с чем сравниваем при «Применить» (основной холст на момент открытия / последнего применения)
  const canvasRef = useRef(null)
  const firstEmit = useRef(true)
  const [choices, setChoices] = useState({})
  const [selRef, setSelRef] = useState(null)
  const [selTick, setSelTick] = useState(0)
  const [applied, setApplied] = useState('')
  const { rules, busy, addFull } = useLessonRules()

  // Холст при монтировании сам приводит ноды к своему виду (служебные переходы) — первое его сообщение берём за точку отсчёта для «Применить»,
  // иначе эта нормализация выглядела бы как 13 «правок» без единого действия автора
  const onBoardNodes = useCallback(list => {
    if (firstEmit.current) { firstEmit.current = false; setBase(list) }
    setDraft(list)
  }, [])

  const nodes = useMemo(() => fromCanvasNodes(draft), [draft])
  const canvasById = useMemo(() => new Map(draft.map(n => [n.id, n])), [draft])
  const items = useMemo(() => buildTranscript(nodes, choices), [nodes, choices])
  const warnMap = useMemo(() => warningsByRef(lintLesson(nodes), nodes), [nodes])
  const sel = nodes.find(n => n.ref === selRef) ?? null
  const diff = useMemo(() => diffNodes(base, draft), [base, draft])
  const switched = Object.keys(choices).length

  const close = useCallback(() => {
    if (diff.changed.length && !window.confirm(`Есть неприменённые правки (нод: ${diff.changed.length}). Закрыть без «Применить»?`)) return
    onClose()
  }, [diff, onClose])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !e.target.closest?.('input, textarea, [contenteditable]')) close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Выбор сообщения: выделяем и ставим холст на ноду — при каждом клике, даже повторном
  const select = useCallback(ref => {
    setSelRef(ref)
    setSelTick(t => t + 1)
    canvasRef.current?.focus(ref)
  }, [])

  const setChoice = (ref, v) => setChoices(c => { const n = { ...c }; if (v === 'wrong') n[ref] = 'wrong'; else delete n[ref]; return n })

  function apply() {
    for (const { id, patch } of diff.changed) boardApiRef.current?.updateNode(id, patch)
    setBase(draft)
    setApplied(`Применено: ${diff.changed.length} ${diff.changed.length === 1 ? 'нода' : 'нод'}. Не забудь сохранить урок (💾)`)
    setTimeout(() => setApplied(''), 5000)
  }

  const shown = new Set(items.filter(i => i.kind === 'node').map(i => i.ref)).size
  return createPortal(
    <div className="rvwFull" onMouseDown={e => e.stopPropagation()}>
      <div className="rvwTop">
        <button className="rvwBack" onClick={close}>← Назад</button>
        <span className="rvwTitle">Разбор урока</span>
        <span className="rvwInfo">в ленте {shown} из {nodes.length} нод{switched ? ` · веток «неверно»: ${switched}` : ''}</span>
        {switched > 0 && <button className="rvwBtn" onClick={() => setChoices({})}>Сбросить ветки</button>}
        <span className="rvwSpacer" />
        {(diff.added > 0 || diff.removed > 0) && <span className="rvwInfo rvwInfoWarn" title="Добавленные и удалённые ноды автоматически не переносятся — сделай это на основном холсте">+{diff.added} / −{diff.removed} нод не переносятся</span>}
        {applied && <span className="rvwInfo rvwInfoOk">{applied}</span>}
        <button className="rvwBtn rvwBtnPrimary" disabled={!diff.changed.length} onClick={apply}>
          Применить{diff.changed.length ? ` (${diff.changed.length})` : ''}
        </button>
      </div>
      <div className="rvwCols">
        <div className="rvwFeedCol">
          <PlayerLikeFeed items={items} canvasById={canvasById} canvasNodes={draft} files={boardProps?.lessonFiles ?? []} selRef={selRef} selTick={selTick} warnMap={warnMap} onSelect={select} onChoice={setChoice} />
        </div>
        <div className="rvwCanvasCol">
          <EmbeddedCanvas ref={canvasRef} initialNodes={initialNodes} initialZones={initialZones} boardProps={boardProps} onNodesChange={onBoardNodes} />
        </div>
        <div className="rvwRight"><RulesPane node={sel} warnings={sel ? warnMap.get(sel.ref) ?? [] : []} rules={rules} busy={busy} onAdd={addFull} /></div>
      </div>
    </div>,
    document.body,
  )
}
