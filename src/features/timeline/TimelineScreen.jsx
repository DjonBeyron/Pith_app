import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildTimeline } from './timelineModel.js'
import { buildPauses } from './timelinePauses.js'
import { buildSummary } from './timelineSummary.js'
import { rows as buildRows, reportText } from './timelineReport.js'
import { fitScale, zoom } from './timelineView.js'
import { dur, THRESHOLDS, DEFAULT_THRESHOLD } from './timelineFormat.js'
import { sourceList } from './timelineStore.js'
import { useTimelineServer } from './useTimelineServer.js'
import TimelineSources from './TimelineSources.jsx'
import TimelineRibbon from './TimelineRibbon.jsx'
import TimelineList from './TimelineList.jsx'
import TimelineCard from './TimelineCard.jsx'
import TimelinePausesTab from './TimelinePausesTab.jsx'
import TimelineActs from './TimelineActs.jsx'
import TimelineMontage from './montage/TimelineMontage.jsx'
import { buildMontage } from './montage/montageModel.js'
import { applyEdits, editsSummary } from './montage/montageEdits.js'
import { editsText } from './montage/montageEditsText.js'
import { useMontageDraft } from './montage/useMontageDraft.js'
import SendLogButton from '../../shared/ui/SendLogButton.jsx'
import '../../styles/timeline.css'
import '../../styles/timeline-ribbon.css'
import '../../styles/timeline-pauses.css'

// «Таймлайн игры» для админа (CONCEPT_TIMELINE.md): реальное прохождение «Встряхни память» на весь экран. Вкладки: «Монтаж» (монтажный стол — слои, клипы по реальной длине звука, зазоры тишины, указатель,
// режим «Правка» с черновиком правок — montage/TimelineMontage.jsx; на ПК, ширина от WIDE_PX, экран открывается на ней), «Паузы» (на телефоне открывается первой: все паузы «игра молчит» дольше порога
// карточками с реальным текстом реплик перед тишиной и после), «Лента» (ось времени, дорожки: этапы, паузы, Пит, Мия, диктор, пилюли, игрок, ожидания) и «Список» (хронология текстом).
// Черновик правок монтажа (useMontageDraft) живёт здесь: хранилище устройства (store — подмена для тестов), сервер (server.saveEdits, runs[i].edits); в отправку логов уходит файлом со списком правок.
// Экран открывается ВНЕ игры и на неё не влияет: читает готовые события трассы. runs — прохождения этого устройства (sceneTrace.runs()); server — { read, save } (shared/api/timelineApi.js через
// TimelineOpenButton; стенд подставляет свой; null — сервера нет): сохранённые на сервере прохождения читаются при открытии экрана и по «↻ Обновить с сервера», в выборе прохождения подписан источник.
// send(comment, opts, report, edits) — отправка логов в GitHub вместе с текстовым отчётом таймлайна и списком правок монтажа (edits — текст или ''); нет send — кнопки нет (стенд). server0 — начальное состояние сервера (тесты разметки).
export const DEFAULT_SCALE = 0.04 // 40 px на секунду: реплика в 2 с — блок 80 px
export const PHONE_SCALE = 0.025  // узкий экран: 25 px на секунду — на 375 px видно ≈ 12 с
export const WIDE_PX = 900        // экран шире — открывается на «Монтаже»
export const MONTAGE_SCALE = 0.05 // монтаж на ПК: 50 px на секунду — реплика в 1,8 с — клип 90 px с текстом
export const MONTAGE_PHONE = 0.03
const TABS = [['montage', 'Монтаж'], ['pauses', 'Паузы'], ['ribbon', 'Лента'], ['list', 'Список']]
const vw = () => (typeof window === 'undefined' ? 0 : window.innerWidth)
const LABEL_W = 62
const EMPTY = { off: 'Игр в этом сеансе ещё не было — сыграй и вернись.', loading: 'Загружаю сохранённые игры с сервера…', ready: 'Игр в этом сеансе ещё не было, на сервере сохранённых игр тоже нет — сыграй и вернись.' }

export default function TimelineScreen({ runs = [], onClose = null, send = null, tab0 = null, server = null, server0 = null, store = null, edit0 = false }) {
  const srv = useTimelineServer(server, server0)
  const entries = useMemo(() => sourceList(runs, srv.state.runs), [runs, srv.state.runs])
  const [pick, setPick] = useState(null) // ключ выбранного прохождения; null — последнее этого устройства, а без них — последнее с сервера
  const cur = entries.find(e => e.key === pick) ?? entries.findLast(e => e.src === 'local') ?? entries[entries.length - 1] ?? null
  const run = cur?.run ?? null, shown = !!run
  const [thr, setThr] = useState(DEFAULT_THRESHOLD)
  const [tab, setTab] = useState(() => tab0 ?? (vw() >= WIDE_PX ? 'montage' : 'pauses'))
  const [zoomed, setScale] = useState(null) // null — масштаб по умолчанию для ширины экрана
  const [sel, setSel] = useState(null)
  const [focus, setFocus] = useState(null)
  const [width, setWidth] = useState(360)
  const [sent, setSent] = useState('')
  const bodyRef = useRef(null)
  useLayoutEffect(() => { const read = () => setWidth(bodyRef.current?.clientWidth ?? 360); read(); window.addEventListener('resize', read); return () => window.removeEventListener('resize', read) }, [shown]) // shown: тело экрана появляется, когда пришли игры с сервера

  const m = useMemo(() => (run ? buildTimeline(run.events, run.meta) : null), [run])
  const pauses = useMemo(() => (m ? buildPauses(m, thr) : []), [m, thr])
  const sum = useMemo(() => (m ? buildSummary(m, pauses) : null), [m, pauses])
  const list = useMemo(() => (m ? buildRows(m, pauses) : []), [m, pauses])
  const base = useMemo(() => (m ? buildMontage(m, thr) : null), [m, thr])
  const draft = useMontageDraft({ runId: cur?.rid ?? null, store, serverEdits: cur?.edits ?? null, saveServer: server?.saveEdits && cur ? d => server.saveEdits(cur.run, d) : null })

  const hasServer = !!server || !!server0
  if (!m) {
    const st = srv.state
    return (
      <div className="tl" data-testid="timeline" role="dialog" aria-label="Таймлайн игры">
        <header className="tlHead"><b className="tlTitle">🎬 Таймлайн игры</b>{onClose && <button type="button" className="tlBtn" onClick={onClose}>✕ Закрыть</button>}</header>
        <div className="tlEmpty" data-testid="tl-empty" data-status={st.status}>
          <p>{st.status === 'error' ? `Игр в этом сеансе ещё не было, а сервер недоступен: ${st.error || 'нет ответа'}. Сыграй на этом устройстве или обнови позже.` : EMPTY[st.status]}</p>
          {hasServer && st.status !== 'loading' && <button type="button" className="tlBtn" onClick={srv.reload} data-testid="tl-reload">↻ Обновить с сервера</button>}
        </div>
      </div>
    )
  }
  const fit = fitScale(m.dur, width - LABEL_W), scale = zoomed ?? (width < 600 ? PHONE_SCALE : DEFAULT_SCALE)
  const near = sel ? (() => { const i = list.findIndex(r => r.ref === sel.ref); return i < 0 ? null : { prev: list.slice(0, i).findLast(r => r.ref !== sel.ref) ?? null, next: list.slice(i + 1).find(r => r.ref !== sel.ref) ?? null } })() : null
  const report = () => reportText(m, { threshold: thr, dropped: run.dropped })
  const editsTxt = () => { if (!draft.edits.length) return ''; const ed = applyEdits(base, draft.edits); return editsText(draft.edits, editsSummary(base, ed), { label: cur.label, missing: ed.missing }) }
  const go = p => { setTab('ribbon'); setSel({ kind: 'pause', ref: p }); setFocus({ t: p.t, n: (focus?.n ?? 0) + 1 }); if (bodyRef.current) bodyRef.current.scrollTop = 0 }
  return (
    <div className="tl" data-testid="timeline" role="dialog" aria-label="Таймлайн игры">
      <header className="tlHead">
        <b className="tlTitle">🎬 Таймлайн игры</b>
        {send && <SendLogButton className="tlBtn" label="📤 В GitHub" send={(comment, opts) => send(comment, opts, report(), editsTxt())} onResult={setSent} data-testid="tl-send" />}
        {onClose && <button type="button" className="tlBtn" onClick={onClose} data-testid="tl-close">✕ Закрыть</button>}
      </header>
      <div className="tlBody" ref={bodyRef}>
        <TimelineSources entries={entries} cur={cur} onPick={k => { setPick(k); setSel(null) }} srv={srv} hasServer={hasServer} />
        <p className="tlSum" data-testid="tl-sum">
          {entries.length === 1 && !hasServer && <span>{cur.label} · </span>}Прохождение <b>{dur(sum.dur)}</b> · Пит {dur(sum.speak.pit)} · Мия {dur(sum.speak.mia)} · диктор {dur(sum.speak.dictor)} · ждали игрока {dur(sum.player)} · <span className="tlRed">игра молчала {dur(sum.dead)}, долгих пауз {sum.longCount}</span>
          {run.dropped > 0 && <span className="tlRed"> · начало трассы вытеснено ({run.dropped} соб.)</span>}
        </p>
        {sent && <p className="tlMuted" data-testid="tl-sent">{sent}</p>}
        <div className="tlBar">
          <div className="tlGroup" role="tablist">
            {TABS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className="tlChip" onClick={() => setTab(k)} data-testid={`tl-tab-${k}`}>{t}</button>)}
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
        {tab === 'montage' && <TimelineMontage key={cur.key} base={base} draft={draft} scale0={vw() && vw() < 600 ? MONTAGE_PHONE : MONTAGE_SCALE} labelW={width < 600 ? 58 : 92} send={send ? (comment, opts, text) => send(comment, opts, report(), text) : null} edit0={edit0} label={cur.label} />}
        {tab === 'pauses' && <TimelinePausesTab key={cur.key} pauses={pauses} total={sum.dur} onGo={go} />}
        {tab === 'ribbon' && <TimelineRibbon m={m} pauses={pauses} scale={Math.max(scale, fit)} focus={focus} selected={sel} onPick={setSel} />}
        {tab === 'list' && <TimelineList rows={list} pauses={pauses} selected={sel} onPick={setSel} />}
        {tab === 'ribbon' && <p className="tlLegend">{[['pit', 'Пит'], ['mia', 'Мия'], ['dictor', 'диктор — слово, перевод, фраза голосом Пита'], ['silent', 'без озвучки (подпись)'], ['dead', 'игра молчит дольше порога']].map(([k, t]) => <span key={k}><i data-who={k} />{t}</span>)}</p>}
        {tab !== 'list' && tab !== 'montage' && <TimelineActs sum={sum} />}
      </div>
      {tab !== 'pauses' && tab !== 'montage' && <TimelineCard sel={sel} near={near} onClose={() => setSel(null)} />}
    </div>
  )
}
