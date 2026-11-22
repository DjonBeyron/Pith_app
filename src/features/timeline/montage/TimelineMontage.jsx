import { useEffect, useMemo, useRef, useState } from 'react'
import { applyEdits, limitsFor, clampTo, makeEdit, setEdit, dropEdit, editsSummary } from './montageEdits.js'
import { clipByKey, groupBefore } from './montageModel.js'
import { stepClip } from './montageNow.js'
import { editsText, summaryText, WHY } from './montageEditsText.js'
import { spanScale } from '../timelineView.js'
import { useMontageView } from './useMontageView.js'
import { useClipDrag } from './useClipDrag.js'
import MontageTracks from './MontageTracks.jsx'
import MontageMinimap from './MontageMinimap.jsx'
import MontageNowPanel from './MontageNowPanel.jsx'
import MontageEditsPanel from './MontageEditsPanel.jsx'
import MontageBar from './MontageBar.jsx'
import '../../../styles/timeline-montage.css'
import '../../../styles/timeline-montage-clips.css'
import '../../../styles/timeline-montage-edit.css'

// Вкладка «Монтаж» таймлайна (CONCEPT_TIMELINE.md, «Монтаж» и «Черновик правок»): монтажный стол — слои сверху вниз, время слева направо; клип = сколько реально звучало аудио, зазор = тишина.
// Указатель (тянется по линейке, ← → по клипам, Home / End) и панель «В этот момент»; масштаб — Ctrl + колесо / кнопки / «вся игра» / «по ширине этапа»; мини-карта всей игры снизу.
// Режим «✎ Правка»: клип тянут по горизонтали (меняется тишина перед ним), правки копятся в черновике draft (useMontageDraft: история с отменой, хранилище устройства, сервер). ИГРА ОТ ПРАВОК НЕ МЕНЯЕТСЯ:
// base — исходный монтаж (montageModel.buildMontage), на экране — applyEdits(base, правки). «👁 оригинал» показывает игру как была.
// send(comment, opts, текст правок) — отправка логов в GitHub со списком правок; label — подпись прохождения для файла; edit0 — открыть сразу в режиме правки (стенд, тесты разметки).
const inField = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.target?.isContentEditable

export default function TimelineMontage({ base, draft, scale0, labelW = 92, send = null, edit0 = false, label = '' }) {
  const [ph, setPh] = useState(0)
  const [sel, setSel] = useState(null)
  const [editOn, setEditOn] = useState(edit0)
  const [mode, setMode] = useState('ripple')
  const [orig, setOrig] = useState(false)
  const [drag, setDrag] = useState(null) // { key, to, hit, why } — клип тянут прямо сейчас
  const [hint, setHint] = useState('')
  const phRef = useRef(0)
  useEffect(() => { phRef.current = ph })
  const edits = draft.edits
  const edited = useMemo(() => applyEdits(base, edits), [base, edits])
  const shown = useMemo(() => (orig ? applyEdits(base, []) : drag ? applyEdits(base, setEdit(edits, makeEdit(base, drag.key, drag.mode, drag.to))) : edited), [base, edits, edited, orig, drag])
  const sum = useMemo(() => editsSummary(base, edited), [base, edited])
  const marked = useMemo(() => (orig ? null : new Set([...edits.map(e => e.key), ...(drag ? [drag.key] : [])])), [edits, drag, orig]) // клипы с правкой — обведены; сдвинутые шлейфом — нет
  const { ref: scrollRef, scale, fit, view: box, win, zoomTo, zoomIn, zoomOut, scrollTo, fitSpan, timeAt, setLeft } = useMontageView({ dur: shown.dur, labelW, scale0, anchor: () => phRef.current })
  const canEdit = editOn && !orig && !draft.pending

  const goto = (t, always = false) => { const x = Math.max(0, Math.min(shown.dur, t)); setPh(x); scrollTo(x, always) }
  const pick = key => { const c = clipByKey(shown, key); if (!c) return; setSel(key); setHint(''); goto(c.t) }
  const pickGap = g => { const grp = shown.groups.find(x => x.g === g.g), next = grp ? shown.clips.find(c => Math.abs(c.t - grp.end) < 1) : null; setSel(next?.key ?? null); setHint(''); setPh(g.t) }
  const modeOf = key => edits.find(e => e.key === key)?.mode ?? mode
  const apply = (key, to, m = modeOf(key)) => {
    const lim = limitsFor(base, edits, key, m); if (!lim) return null
    const r = clampTo(lim, to)
    draft.set(setEdit(edits, makeEdit(base, key, m, r.to)))
    return { ...r, why: r.hit === 'min' ? lim.why : r.hit }
  }
  const revert = key => draft.set(dropEdit(edits, key))

  const onDown = useClipDrag({
    enabled: canEdit, scale,
    begin: key => { const lim = limitsFor(base, edits, key, mode); if (!lim) return null; setSel(key); setHint(''); return { ...lim, from: edits.find(e => e.key === key)?.to ?? lim.from } },
    move: (key, d) => { setDrag({ key, mode, ...d }); setHint(d.hit ? `Упёрся — ${WHY[d.why] ?? WHY.max}` : '') },
    end: (key, to) => { setDrag(null); if (to != null) draft.set(setEdit(edits, makeEdit(base, key, mode, to))) },
    click: pick,
  })

  const scrub = e => { // указатель: нажать или тянуть по линейке
    if (e.target.closest('.mtgLabel')) return
    e.preventDefault()
    const go = ev => setPh(Math.min(shown.dur, timeAt(ev.clientX)))
    const up = () => { window.removeEventListener('pointermove', go); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
    go(e); window.addEventListener('pointermove', go); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const downLeft = useRef(0)
  const clickEmpty = e => { if (e.target.closest('button, [data-ruler], .mtgLabel') || Math.abs(scrollRef.current.scrollLeft - downLeft.current) > 3) return; setPh(Math.min(shown.dur, timeAt(e.clientX))) }

  const keys = useRef(null)
  useEffect(() => { keys.current = { shown, goto, canEdit, draft } })
  useEffect(() => {
    const on = e => {
      const k = keys.current
      if (inField(e) || e.defaultPrevented || e.altKey) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.code === 'KeyZ') { e.preventDefault(); if (k.canEdit) { if (e.shiftKey) k.draft.redo(); else k.draft.undo() } return }
      if (mod && e.code === 'KeyY') { e.preventDefault(); if (k.canEdit) k.draft.redo(); return }
      if (mod) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); k.goto(stepClip(k.shown, phRef.current, e.key === 'ArrowRight' ? 1 : -1)) }
      else if (e.key === 'Home') { e.preventDefault(); k.goto(0, true) }
      else if (e.key === 'End') { e.preventDefault(); k.goto(k.shown.dur, true) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  const selClip = sel ? clipByKey(shown, sel) : null, selGap = selClip ? groupBefore(shown, selClip)?.g ?? null : null
  const stage = shown.stages.findLast(s => s.t <= ph) ?? shown.stages[0] ?? null
  const text = () => editsText(edits, sum, { label, missing: edited.missing })
  return (
    <div className="mtg" data-testid="tl-montage" data-edit={editOn ? '1' : '0'} data-drag={drag ? '1' : undefined}>
      <MontageBar
        editOn={editOn} onEdit={() => { setEditOn(v => !v); setHint('') }} mode={mode} onMode={setMode} orig={orig} onOrig={() => setOrig(v => !v)} draft={draft} sum={sum} summary={summaryText(sum)}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={() => zoomTo(fit)} onStage={stage ? () => fitSpan(stage, spanScale(stage, box.width, fit)) : null}
      />
      <div className="mtgMain">
        <div className="mtgBox">
          <div className="mtgScroll" ref={scrollRef} onPointerDownCapture={() => { downLeft.current = scrollRef.current?.scrollLeft ?? 0 }} onClick={clickEmpty} data-testid="mtg-scroll">
            <MontageTracks mont={shown} scale={scale} win={win} labelW={labelW} ph={Math.min(ph, shown.dur)} sel={sel} selGap={selGap} edit={canEdit} moved={orig ? null : shown.moved} marked={marked} drag={drag} onDown={onDown} onPick={pick} onGap={pickGap} onScrub={scrub} />
          </div>
          {hint && <p className="mtgToast" data-testid="mtg-hint">{hint}</p>}
          <MontageMinimap mont={shown} view={box} scale={scale} ph={Math.min(ph, shown.dur)} onLeft={setLeft} />
        </div>
        <aside className="mtgSide">
          {editOn && <MontageEditsPanel base={base} draft={draft} missing={edited.missing} sel={canEdit ? sel : null} mode={mode} apply={apply} revert={revert} onGoto={e => { const c = clipByKey(edited, e.key); if (c) { setOrig(false); setSel(e.key); goto(c.t, true) } }} text={text} send={send} summary={summaryText(sum)} />}
          <MontageNowPanel mont={shown} t={Math.min(ph, shown.dur)} />
        </aside>
      </div>
    </div>
  )
}
