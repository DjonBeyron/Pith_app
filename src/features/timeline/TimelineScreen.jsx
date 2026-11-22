import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildTimeline } from './timelineModel.js'
import { buildPauses, topDead } from './timelinePauses.js'
import { buildSummary } from './timelineSummary.js'
import { rows as buildRows, reportText } from './timelineReport.js'
import { fitScale, zoom } from './timelineView.js'
import { dur, THRESHOLDS, DEFAULT_THRESHOLD } from './timelineFormat.js'
import TimelineRibbon from './TimelineRibbon.jsx'
import TimelineList from './TimelineList.jsx'
import TimelineCard from './TimelineCard.jsx'
import TimelinePauses from './TimelinePauses.jsx'
import SendLogButton from '../../shared/ui/SendLogButton.jsx'
import '../../styles/timeline.css'
import '../../styles/timeline-ribbon.css'

// «Таймлайн игры» для админа (CONCEPT_TIMELINE.md, шаг 1 — только просмотр): реальное прохождение «Встряхни память» на весь экран. Лента (ось времени, дорожки: этапы, Пит, Мия, диктор, пилюли, игрок,
// ожидания, паузы) и «Список» (та же хронология текстом). Главное — паузы «игра молчит» дольше порога: красные отрезки, список самых долгих, сводка по этапам. Экран открывается ВНЕ игры и на неё не влияет:
// читает готовые события трассы (runs — sceneTrace.runs()). send(comment, opts, report) — отправка логов в GitHub вместе с текстовым отчётом таймлайна; нет send — кнопки нет (стенд).
export const DEFAULT_SCALE = 0.04 // 40 px на секунду: реплика в 2 с — блок 80 px
export const PHONE_SCALE = 0.025  // узкий экран: 25 px на секунду — на 375 px видно ≈ 12 с
const LABEL_W = 62
const hasScene = r => r?.events?.some(e => e.k === 'stage-in' || e.k === 'line-start')
const runName = r => `№${r.id}${r.at ? ` · ${new Date(r.at).toTimeString().slice(0, 5)}` : ''}${r.meta?.game ? ` · ${r.meta.game}${r.meta.only ? `/${r.meta.only}` : ''}` : ''} · ${r.events.length} соб.`

export default function TimelineScreen({ runs = [], onClose = null, send = null, tab0 = 'ribbon' }) {
  const usable = useMemo(() => runs.filter(hasScene), [runs])
  const [runId, setRunId] = useState(null)
  const run = usable.find(r => r.id === runId) ?? usable[usable.length - 1] ?? null
  const [thr, setThr] = useState(DEFAULT_THRESHOLD)
  const [tab, setTab] = useState(tab0)
  const [zoomed, setScale] = useState(null) // null — масштаб по умолчанию для ширины экрана
  const [sel, setSel] = useState(null)
  const [focus, setFocus] = useState(null)
  const [width, setWidth] = useState(360)
  const [sent, setSent] = useState('')
  const bodyRef = useRef(null)
  useLayoutEffect(() => { const read = () => setWidth(bodyRef.current?.clientWidth ?? 360); read(); window.addEventListener('resize', read); return () => window.removeEventListener('resize', read) }, [])

  const m = useMemo(() => (run ? buildTimeline(run.events, run.meta) : null), [run])
  const pauses = useMemo(() => (m ? buildPauses(m, thr) : []), [m, thr])
  const sum = useMemo(() => (m ? buildSummary(m, pauses) : null), [m, pauses])
  const list = useMemo(() => (m ? buildRows(m, pauses) : []), [m, pauses])
  const top = useMemo(() => topDead(pauses), [pauses])

  if (!m) {
    return (
      <div className="tl" data-testid="timeline" role="dialog" aria-label="Таймлайн игры">
        <header className="tlHead"><b className="tlTitle">🎬 Таймлайн игры</b>{onClose && <button type="button" className="tlBtn" onClick={onClose}>✕ Закрыть</button>}</header>
        <p className="tlEmpty" data-testid="tl-empty">Игр в этом сеансе ещё не было — сыграй и вернись.</p>
      </div>
    )
  }
  const fit = fitScale(m.dur, width - LABEL_W), scale = zoomed ?? (width < 600 ? PHONE_SCALE : DEFAULT_SCALE)
  const near = sel ? (() => { const i = list.findIndex(r => r.ref === sel.ref); return i < 0 ? null : { prev: list.slice(0, i).findLast(r => r.ref !== sel.ref) ?? null, next: list.slice(i + 1).find(r => r.ref !== sel.ref) ?? null } })() : null
  const go = p => { setTab('ribbon'); setSel({ kind: 'pause', ref: p }); setFocus({ t: p.t, n: (focus?.n ?? 0) + 1 }); if (bodyRef.current) bodyRef.current.scrollTop = 0 }
  return (
    <div className="tl" data-testid="timeline" role="dialog" aria-label="Таймлайн игры">
      <header className="tlHead">
        <b className="tlTitle">🎬 Таймлайн игры</b>
        {usable.length > 1 && <select className="tlSelect" aria-label="Прохождение" value={run.id} onChange={e => { setRunId(Number(e.target.value)); setSel(null) }}>{usable.map(r => <option key={r.id} value={r.id}>{runName(r)}</option>)}</select>}
        {send && <SendLogButton className="tlBtn" label="📤 В GitHub" send={(comment, opts) => send(comment, opts, reportText(m, { threshold: thr, dropped: run.dropped }))} onResult={setSent} data-testid="tl-send" />}
        {onClose && <button type="button" className="tlBtn" onClick={onClose} data-testid="tl-close">✕ Закрыть</button>}
      </header>
      <div className="tlBody" ref={bodyRef}>
        <p className="tlSum" data-testid="tl-sum">
          {usable.length === 1 && <span>{runName(run)} · </span>}Прохождение <b>{dur(sum.dur)}</b> · Пит {dur(sum.speak.pit)} · Мия {dur(sum.speak.mia)} · диктор {dur(sum.speak.dictor)} · ждали игрока {dur(sum.player)} · <span className="tlRed">игра молчала {dur(sum.dead)}, долгих пауз {sum.longCount}</span>
          {run.dropped > 0 && <span className="tlRed"> · начало трассы вытеснено ({run.dropped} соб.)</span>}
        </p>
        {sent && <p className="tlMuted" data-testid="tl-sent">{sent}</p>}
        <div className="tlBar">
          <div className="tlGroup" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'ribbon'} className="tlChip" onClick={() => setTab('ribbon')}>Лента</button>
            <button type="button" role="tab" aria-selected={tab === 'list'} className="tlChip" onClick={() => setTab('list')} data-testid="tl-tab-list">Список</button>
          </div>
          <div className="tlGroup" role="radiogroup" aria-label="Порог долгой паузы">
            <span className="tlMuted">долгая от</span>
            {THRESHOLDS.map(v => <button key={v} type="button" role="radio" aria-checked={thr === v} className="tlChip" onClick={() => setThr(v)}>{dur(v)}</button>)}
          </div>
          {tab === 'ribbon' && (
            <div className="tlGroup" aria-label="Масштаб">
              <button type="button" className="tlChip" onClick={() => setScale(zoom(scale, -1, fit))} aria-label="Мельче">−</button>
              <button type="button" className="tlChip" onClick={() => setScale(zoom(scale, 1, fit))} aria-label="Крупнее">+</button>
              <button type="button" className="tlChip" onClick={() => setScale(fit)} data-testid="tl-fit">всё прохождение</button>
            </div>
          )}
        </div>
        {tab === 'ribbon' ? <TimelineRibbon m={m} pauses={pauses} scale={Math.max(scale, fit)} focus={focus} selected={sel} onPick={setSel} /> : <TimelineList rows={list} pauses={pauses} selected={sel} onPick={setSel} />}
        {tab === 'ribbon' && <p className="tlLegend">{[['pit', 'Пит'], ['mia', 'Мия'], ['dictor', 'диктор — слово, перевод, фраза голосом Пита'], ['silent', 'без озвучки (подпись)'], ['dead', 'игра молчит дольше порога']].map(([k, t]) => <span key={k}><i data-who={k} />{t}</span>)}</p>}
        <TimelinePauses top={top} sum={sum} onGo={go} />
      </div>
      <TimelineCard sel={sel} near={near} onClose={() => setSel(null)} />
    </div>
  )
}
