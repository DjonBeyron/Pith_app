import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import { fromCanvasNodes, lintLesson } from '../lesson-io/lessonLint.js'
import { useLessonRules } from '../lesson-io/useLessonRules.js'
import { buildTranscript, warningsByRef, optChoice } from './lessonTranscript.js'
import { diffNodes } from './applyChanges.js'
import PlayerLikeFeed from './PlayerLikeFeed.jsx'
import EmbeddedCanvas from './EmbeddedCanvas.jsx'
import BrokenNodesBadge from '../health/BrokenNodesBadge.jsx'
import { useLessonHealth } from '../health/useLessonHealth.js'
import RulesPane from './RulesPane.jsx'
import NoteDialog from './NoteDialog.jsx'
import NotesWindow from './NotesWindow.jsx'
import { useReviewNotes } from './useReviewNotes.js'
import { nodeCopyText } from './nodeCopyText.js'
import { applyTypeChange } from '../nodeDefaults.js'
import { useNoteSession } from './useNoteSession.js'
import { useLessonVersions } from './useLessonVersions.js'
import { changedRefs } from './reviewNotes.js'
import { reviewKey, loadReview, saveReview } from './reviewStorage.js'

// «Разбор урока» — окно на весь экран ПК: слева копия ленты плеера (вся история сразу, на заданиях переключатель веток «верно / неверно»),
// посередине полноценный холст, сфокусированный на выбранной ноде (редактируешь как обычно), справа замечания и правила.
// Холст здесь — СВОЯ копия нод: правки попадают в основной урок только по кнопке «Применить».
const NO_FILES = []

export default function LessonReviewPanel({ nodes: initialNodes, zones: initialZones, boardApiRef, boardProps, storageId, teacherName, onClose }) {
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
  const session = useNoteSession(canvasRef, noteFor, setNoteFor)

  // Холст при монтировании сам приводит ноды к своему виду (служебные переходы) — первое его сообщение берём за точку отсчёта для «Применить»,
  // иначе эта нормализация выглядела бы как 13 «правок» без единого действия автора
  const onBoardNodes = useCallback(list => {
    if (firstEmit.current) {
      firstEmit.current = false; setBase(list)
      // Правки текста, сохранённые до перезагрузки, возвращаем в копию урока — уже после того, как холст поднялся (base остаётся оригиналом)
      setTimeout(() => { for (const [id, e] of Object.entries(saved?.edits ?? {})) canvasRef.current?.updateNode(id, () => (e.typeData ? { ...(e.type ? { type: e.type } : {}), ...(e.triggers ? { triggers: e.triggers } : {}), typeData: e.typeData } : { typeData: e })) }, 0)
    }
    setDraft(list)
  }, [saved])

  // Тяжёлое (линтеры, расшифровка ленты) считаем по «отложенной» копии: набор текста не ждёт пересчёта ленты
  const dDraft = useDeferredValue(draft)
  const nodes = useMemo(() => fromCanvasNodes(dDraft), [dDraft])
  const canvasById = useMemo(() => new Map(dDraft.map(n => [n.id, n])), [dDraft])
  const items = useMemo(() => buildTranscript(nodes, choices), [nodes, choices])
  // Сколько нод в списке замечаний: с замечанием ИЛИ с правкой текста (правка без комментария тоже считается)
  const edited = changedRefs(store.originalTexts(), nodes)
  // Сохраняем замечания, оригиналы и правки в localStorage — после перезагрузки всё на месте
  useEffect(() => {
    const id = setTimeout(() => {
      const edits = Object.fromEntries(edited.map(r => [r, { type: canvasById.get(r)?.type, typeData: canvasById.get(r)?.typeData, triggers: canvasById.get(r)?.triggers }]).filter(([, v]) => v.typeData))
      saveReview(key, { notes: store.notes, general: store.general, originals: [...store.originals.current], edits })
    }, 600) // не на каждую букву: запись больших снимков тормозила набор
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, store.notes, store.general, store.version, draft])
  const noted = new Set([...store.notes.map(n => n.ref), ...edited]).size + store.general.length
  const noteCounts = useMemo(() => { const m = new Map(); for (const n of store.notes) m.set(n.ref, (m.get(n.ref) ?? 0) + 1); for (const r of edited) if (!m.has(r)) m.set(r, 1); return m }, [store.notes, edited])
  const warnMap = useMemo(() => warningsByRef(lintLesson(nodes, { title: boardProps?.lessonTitle }), nodes), [nodes, boardProps?.lessonTitle])
  const versions = useLessonVersions(storageId ?? initialNodes[0]?.id ?? 'lesson', nodes, new Set(store.notes.map(n => n.ref)))
  const [rulesOff, setRulesOff] = useState(() => { try { return localStorage.getItem('pithy-review-rules-off') === '1' } catch { return false } })
  const toggleRules = () => setRulesOff(v => { try { localStorage.setItem('pithy-review-rules-off', v ? '0' : '1') } catch { /* нет хранилища */ } return !v })
  const sel = nodes.find(n => n.ref === selRef) ?? null
  const health = useLessonHealth({ nodes: dDraft, files: boardProps?.lessonFiles ?? NO_FILES }) // сломанные ноды — тот же значок, что в шапке канваса
  const diff = useMemo(() => diffNodes(base, dDraft), [base, dDraft])
  const switched = Object.keys(choices).length

  // «До» фиксируется при первом открытии окна замечания к ноде и дальше не меняется (даже если правишь и открываешь снова)
  const openNote = ref => {
    const it = items.find(i => i.kind === 'node' && i.ref === ref)
    if (it) store.remember(ref, { item: it, canvasNode: canvasById.get(ref), text: nodeCopyText(it.node, { markup: true }) })
    setNoteFor(ref)
    session.open(ref)
  }
  // Правка ноды прямо из окна замечания: функция (data) => data для typeData[type] — идёт в копию урока разбора
  // Смена вида ноды из окна замечания — тем же правилом, что на холсте (триггеры под новый тип, текст переезжает)
  const changeType = type => session.patchRaw(n => applyTypeChange(n, type))

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
  const pickOption = useCallback((ref, id) => setChoices(c => { const n = { ...c }; if (n[ref] === optChoice(id)) delete n[ref]; else n[ref] = optChoice(id); return n }), [])
  const setChoice = useCallback((ref, v) => setChoices(c => { const n = { ...c }; if (v === 'wrong') n[ref] = 'wrong'; else delete n[ref]; return n }), [])

  // Отложенный набор из открытого окна замечания сначала доходит до копии урока, и только потом применяем
  const applyRef = useRef(null)
  function apply() {
    if (noteFor && session.flushAll()) { setTimeout(() => applyRef.current?.(), 80); return }
    applyNow()
  }
  function applyNow() {
    session.keep() // окно замечания закрывается само, как только правки применены (его правки остаются)
    setNotesOpen(false)
    for (const { id, patch } of diff.changed) boardApiRef.current?.updateNode(id, patch)
    setBase(dDraft)
    setApplied(`Применено: ${diff.changed.length} ${diff.changed.length === 1 ? 'нода' : 'нод'}. Не забудь сохранить урок (💾)`)
    setTimeout(() => setApplied(''), 5000)
  }

  useEffect(() => { applyRef.current = applyNow })
  // Стабильный обработчик для мемо-слотов ленты: всегда зовёт свежий openNote
  const openNoteRef = useRef(null)
  useEffect(() => { openNoteRef.current = openNote })
  const onNote = useCallback(ref => openNoteRef.current?.(ref), [])

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
        <BrokenNodesBadge health={health} onFocus={select} />
        <button className={`rvwBtn rvwBtnChg${versions.show ? ' on' : ''}`} disabled={!versions.canCompare} onClick={() => versions.setShow(!versions.show)}
          title={versions.canCompare ? 'Розовая полоска у сообщений, которые отличаются от предыдущей версии (новые, изменённые и те, к которым были замечания)' : 'Предыдущей версии урока ещё нет: она появится, когда урок изменится и разбор откроют снова'}>
          Изменения{versions.show ? ` (${versions.marks.size})` : ''}
        </button>
        <button className="rvwBtn" onClick={() => setNotesOpen(true)}>✎ Замечания{noted ? ` (${noted})` : ''}</button>
        <button className="rvwBtn rvwBtnPrimary" disabled={!diff.changed.length} onClick={apply}>
          Применить{diff.changed.length ? ` (${diff.changed.length})` : ''}
        </button>
      </div>
      <div className={`rvwCols${rulesOff ? ' rvwRulesOff' : ''}${noteFor ? ' rvwColsBehind' : ''}`}>
        <div className="rvwRight">
          <button className="rvwRulesToggle" onClick={toggleRules} title={rulesOff ? 'Развернуть правила' : 'Свернуть правила'}>{rulesOff ? '›' : '‹ Правила'}</button>
          {!rulesOff && <RulesPane node={sel} warnings={sel ? warnMap.get(sel.ref) ?? [] : []} rules={rules} busy={busy} onAdd={addFull} />}
        </div>
        <div className="rvwFeedCol">
          <PlayerLikeFeed items={items} canvasById={canvasById} canvasNodes={draft} files={boardProps?.lessonFiles ?? NO_FILES} selRef={selRef} selTick={selTick} warnMap={warnMap} noteCounts={noteCounts} changeMarks={versions.marks} teacherName={teacherName} onNote={onNote} onSelect={select} onChoice={setChoice} onPick={pickOption} />
        </div>
        <div className="rvwCanvasCol">
          <EmbeddedCanvas ref={canvasRef} initialNodes={initialNodes} initialZones={initialZones} boardProps={boardProps} onNodesChange={onBoardNodes} />
        </div>
      </div>
      {noteFor && (
        <NoteDialog title={`Замечание к №${nodes.find(n => n.ref === noteFor)?.seq} (${noteFor})`} existing={store.notes.filter(n => n.ref === noteFor)} before={store.originals.current.get(noteFor)}
          item={items.find(i => i.kind === 'node' && i.ref === noteFor)} canvasNode={canvasById.get(noteFor)} canvasNodes={draft} files={boardProps?.lessonFiles ?? []} teacherName={teacherName} onPatch={session.patch} onType={changeType} session={session}
          onSave={(t, x) => store.addNote(noteFor, t, x)} onRemove={store.removeNote} onClose={session.cancel} onKeep={session.keep} />
      )}
      {notesOpen && <NotesWindow store={store} items={items} nodes={nodes} lessonTitle={boardProps?.lessonTitle ?? ''} onFocus={r => { select(r); setNotesOpen(false) }} onClose={() => setNotesOpen(false)} />}
    </div>,
    document.body,
  )
}
