import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fromCanvasNodes, lintLesson } from '../lesson-io/lessonLint.js'
import { useLessonRules } from '../lesson-io/useLessonRules.js'
import { buildTranscript, warningsByRef, optChoice } from './lessonTranscript.js'
import { diffNodes } from './applyChanges.js'
import PlayerLikeFeed from './PlayerLikeFeed.jsx'
import EmbeddedCanvas from './EmbeddedCanvas.jsx'
import RulesPane from './RulesPane.jsx'
import NoteDialog from './NoteDialog.jsx'
import NotesWindow from './NotesWindow.jsx'
import { useReviewNotes } from './useReviewNotes.js'
import { nodeCopyText } from './nodeCopyText.js'
import { changedRefs } from './reviewNotes.js'
import { reviewKey, loadReview, saveReview } from './reviewStorage.js'

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
  const key = useMemo(() => reviewKey(initialNodes), [initialNodes])
  const saved = useMemo(() => loadReview(key), [key])
  const store = useReviewNotes(saved)
  const [noteFor, setNoteFor] = useState(null) // ref ноды, к которой пишем замечание
  const [notesOpen, setNotesOpen] = useState(false)

  // Холст при монтировании сам приводит ноды к своему виду (служебные переходы) — первое его сообщение берём за точку отсчёта для «Применить»,
  // иначе эта нормализация выглядела бы как 13 «правок» без единого действия автора
  const onBoardNodes = useCallback(list => {
    if (firstEmit.current) {
      firstEmit.current = false; setBase(list)
      // Правки текста, сохранённые до перезагрузки, возвращаем в копию урока — уже после того, как холст поднялся (base остаётся оригиналом)
      setTimeout(() => { for (const [id, typeData] of Object.entries(saved?.edits ?? {})) canvasRef.current?.updateNode(id, () => ({ typeData })) }, 0)
    }
    setDraft(list)
  }, [saved])

  const nodes = useMemo(() => fromCanvasNodes(draft), [draft])
  const canvasById = useMemo(() => new Map(draft.map(n => [n.id, n])), [draft])
  const items = useMemo(() => buildTranscript(nodes, choices), [nodes, choices])
  // Сколько нод в списке замечаний: с замечанием ИЛИ с правкой текста (правка без комментария тоже считается)
  const edited = changedRefs(store.originalTexts(), nodes)
  // Сохраняем замечания, оригиналы и правки в localStorage — после перезагрузки всё на месте
  useEffect(() => {
    const edits = Object.fromEntries(edited.map(r => [r, canvasById.get(r)?.typeData]).filter(([, v]) => v))
    saveReview(key, { notes: store.notes, general: store.general, originals: [...store.originals.current], edits })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, store.notes, store.general, store.version, draft])
  const noted = new Set([...store.notes.map(n => n.ref), ...edited]).size + store.general.length
  const noteCounts = useMemo(() => { const m = new Map(); for (const n of store.notes) m.set(n.ref, (m.get(n.ref) ?? 0) + 1); for (const r of edited) if (!m.has(r)) m.set(r, 1); return m }, [store.notes, edited])
  const warnMap = useMemo(() => warningsByRef(lintLesson(nodes), nodes), [nodes])
  const sel = nodes.find(n => n.ref === selRef) ?? null
  const diff = useMemo(() => diffNodes(base, draft), [base, draft])
  const switched = Object.keys(choices).length

  // «До» фиксируется при первом открытии окна замечания к ноде и дальше не меняется (даже если правишь и открываешь снова)
  const openNote = ref => {
    const it = items.find(i => i.kind === 'node' && i.ref === ref)
    if (it) store.remember(ref, { item: it, canvasNode: canvasById.get(ref), text: nodeCopyText(it.node, { markup: true }) })
    setNoteFor(ref)
  }
  // Правка ноды прямо из окна замечания: функция (data) => data для typeData[type] — идёт в копию урока разбора
  const patchNode = fn => canvasRef.current?.updateNode(noteFor, n => ({ typeData: { ...n.typeData, [n.type]: fn(n.typeData?.[n.type] ?? {}) } }))

  const close = useCallback(() => {
    const lost = []
    if (diff.changed.length) lost.push(`неприменённые правки (нод: ${diff.changed.length})`)
    if (noted) lost.push(`замечания и правки (${noted}), которые не скопированы в JSON`)
    if (lost.length && !window.confirm(`Есть ${lost.join(' и ')}. Закрыть?`)) return
    onClose()
  }, [diff, onClose, noted])

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

  // Клик по варианту «Выбери слово»: выбираем реальный ответ (повторный клик по нему — снять); ветка идёт по варианту
  const pickOption = (ref, id) => setChoices(c => { const n = { ...c }; if (n[ref] === optChoice(id)) delete n[ref]; else n[ref] = optChoice(id); return n })
  const setChoice = (ref, v) => setChoices(c => { const n = { ...c }; if (v === 'wrong') n[ref] = 'wrong'; else delete n[ref]; return n })

  function apply() {
    setNoteFor(null); setNotesOpen(false) // окно замечания закрывается само, как только правки применены
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
        <span className="rvwInfo">в ленте {shown} из {nodes.length} нод{switched ? ` · выбрано ответов: ${switched}` : ''}</span>
        {switched > 0 && <button className="rvwBtn" onClick={() => setChoices({})}>Сбросить ответы</button>}
        <span className="rvwSpacer" />
        {(diff.added > 0 || diff.removed > 0) && <span className="rvwInfo rvwInfoWarn" title="Добавленные и удалённые ноды автоматически не переносятся — сделай это на основном холсте">+{diff.added} / −{diff.removed} нод не переносятся</span>}
        {applied && <span className="rvwInfo rvwInfoOk">{applied}</span>}
        <button className="rvwBtn" onClick={() => setNotesOpen(true)}>✎ Замечания{noted ? ` (${noted})` : ''}</button>
        <button className="rvwBtn rvwBtnPrimary" disabled={!diff.changed.length} onClick={apply}>
          Применить{diff.changed.length ? ` (${diff.changed.length})` : ''}
        </button>
      </div>
      <div className="rvwCols">
        <div className="rvwFeedCol">
          <PlayerLikeFeed items={items} canvasById={canvasById} canvasNodes={draft} files={boardProps?.lessonFiles ?? []} selRef={selRef} selTick={selTick} warnMap={warnMap} noteCounts={noteCounts} onNote={openNote} onSelect={select} onChoice={setChoice} onPick={pickOption} />
        </div>
        <div className="rvwCanvasCol">
          <EmbeddedCanvas ref={canvasRef} initialNodes={initialNodes} initialZones={initialZones} boardProps={boardProps} onNodesChange={onBoardNodes} />
        </div>
        <div className="rvwRight"><RulesPane node={sel} warnings={sel ? warnMap.get(sel.ref) ?? [] : []} rules={rules} busy={busy} onAdd={addFull} /></div>
      </div>
      {noteFor && (
        <NoteDialog title={`Замечание к №${nodes.find(n => n.ref === noteFor)?.seq} (${noteFor})`} existing={store.notes.filter(n => n.ref === noteFor)} before={store.originals.current.get(noteFor)}
          item={items.find(i => i.kind === 'node' && i.ref === noteFor)} canvasNode={canvasById.get(noteFor)} canvasNodes={draft} files={boardProps?.lessonFiles ?? []} onPatch={patchNode}
          onSave={(t, x) => store.addNote(noteFor, t, x)} onRemove={store.removeNote} onClose={() => setNoteFor(null)} />
      )}
      {notesOpen && <NotesWindow store={store} items={items} nodes={nodes} lessonTitle={boardProps?.lessonTitle ?? ''} onFocus={r => { select(r); setNotesOpen(false) }} onClose={() => setNotesOpen(false)} />}
    </div>,
    document.body,
  )
}
