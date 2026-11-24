import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildTimeline } from './timelineModel.js'
import { buildPauses } from './timelinePauses.js'
import { buildSummary } from './timelineSummary.js'
import { rows as buildRows, reportText } from './timelineReport.js'
import { fitScale, zoom } from './timelineView.js'
import { dur, THRESHOLDS, DEFAULT_THRESHOLD } from './timelineFormat.js'
import { sourceList, deviceLabel } from './timelineStore.js'
import { blockHead } from './timelineBlock.js'
import { blockContext } from './timelineBlockContext.js'
import { blockFile, runEventsFile } from './timelineLog.js'
import { useTimelineServer } from './useTimelineServer.js'
import { useClipAudio } from './useClipAudio.js'
import { useLineEdit } from './useLineEdit.js'
import { voiceMarks, voiceTodo } from './timelineLineEdit.js'
import TimelineVoiceTodo from './TimelineVoiceTodo.jsx'
import { usePauseKnobs } from './usePauseKnobs.js'
import { overridesText } from './timelineKnobs.js'
import TimelineKnobsPanel from './TimelineKnobsPanel.jsx'
import TimelineSources from './TimelineSources.jsx'
import TimelineRibbon from './TimelineRibbon.jsx'
import TimelineList from './TimelineList.jsx'
import TimelineCard from './TimelineCard.jsx'
import TimelinePausesTab from './TimelinePausesTab.jsx'
import TimelineActs from './TimelineActs.jsx'
import TimelineCheck from './check/TimelineCheck.jsx'
import { checkScenario, LIGHT_ICON } from './check/scenarioCheck.js'
import TimelineMontage from './montage/TimelineMontage.jsx'
import { buildMontage } from './montage/montageModel.js'
import { applyEdits, editsSummary } from './montage/montageEdits.js'
import { editsText } from './montage/montageEditsText.js'
import { useMontageDraft } from './montage/useMontageDraft.js'
import SendLogButton from '../../shared/ui/SendLogButton.jsx'
import { APP_VERSION } from '../../shared/lib/version.js'
import '../../styles/timeline.css'
import '../../styles/timeline-ribbon.css'
import '../../styles/timeline-pauses.css'
import '../../styles/timeline-block.css'
import '../../styles/timeline-line-edit.css'
import '../../styles/timeline-listen.css'
import '../../styles/timeline-check.css'

// «Таймлайн игры» для админа (CONCEPT_TIMELINE.md): реальное прохождение «Встряхни память» на весь экран. Вкладки: «Монтаж» (монтажный стол — слои, клипы по реальной длине звука, зазоры тишины, указатель,
// режим «Правка» с черновиком правок — montage/TimelineMontage.jsx; на ПК, ширина от WIDE_PX, экран открывается на ней), «Паузы» (на телефоне открывается первой: все паузы «игра молчит» дольше порога
// карточками с реальным текстом реплик перед тишиной и после), «Лента» (ось времени, дорожки: этапы, паузы, Пит, Мия, диктор, пилюли, игрок, ожидания) и «Список» (хронология текстом).
// ШАПКА КОМПАКТНАЯ (две строки): в первой — название, выбор прохождения с сервером, «В GitHub», «Закрыть»; во второй — вкладки, порог долгой паузы и сводка одной строкой. Столу монтажа остаётся больше 75 % высоты окна.
// Любой блок (реплика, пилюля, ответ, этап, тишина, отсчёт, ожидание) на любой вкладке: карточка с «💬 Комментарий в GitHub» (адрес блока в комментарии + файл-контекст — timelineBlockContext.js), у реплики — «▶ Слушать»
// (useClipAudio: озвучка из текущих настроек обычным <audio>; на «Монтаже» и «Ленте» клип играет по нажатию). voices — { load() → { lines, lib } } (TimelineOpenButton; null — звука нет).
// У реплики Пита / Мии в карточке — копирование, правка текста (меняет реплику ВЕЗДЕ: общие настройки реплик игры), «Озвучить заново», свой файл, «вернуть прежний текст» (useLineEdit + lineApi); в шапке —
// «🎙 Нужно озвучить (N)» (TimelineVoiceTodo), на клипах монтажа — метка (voiceMarks). todo0 — список «Нужно озвучить» сразу раскрыт (тесты разметки).
// Вкладка «Проверка 🎧» (check/TimelineCheck.jsx): проверка сценария ИЗ КОДА по текущим настройкам реплик (check/scenarioCheck.js — светофор на вкладке) и прослушивание — сценарий сейчас либо последняя игра;
// работает и без единой игры (пустой экран показывает её же). check0 — { src0, only0, open0 } начальный вид проверки (тесты разметки, стенд).
// Настройки пауз (usePauseKnobs + pauseApi): у тишины — «Чем задана эта тишина» с правкой, на столе — ⚙ у зазора, в шапке — «⚙ Настройки пауз» (TimelineKnobsPanel); knobs0 — панель сразу открыта (тесты разметки).
// Черновик правок монтажа (useMontageDraft) живёт здесь: хранилище устройства (store — подмена для тестов), сервер (server.saveEdits, runs[i].edits); в отправку логов уходит файлом со списком правок.
// Экран открывается ВНЕ игры и на неё не влияет: читает готовые события трассы. runs — прохождения этого устройства (sceneTrace.runs()); server — { read, save } (shared/api/timelineApi.js через
// TimelineOpenButton; стенд подставляет свой; null — сервера нет): сохранённые на сервере прохождения читаются при открытии экрана и по «↻ Обновить с сервера», в выборе прохождения подписан источник.
// send(comment, opts, report, edits, pinned) — отправка логов в GitHub вместе с текстовым отчётом таймлайна, списком правок монтажа (edits — текст или '') и файлами блока (pinned — уходят и без логов); нет send — кнопок нет. server0 — начальное состояние сервера (тесты разметки).
export const DEFAULT_SCALE = 0.04 // 40 px на секунду: реплика в 2 с — блок 80 px
export const PHONE_SCALE = 0.025  // узкий экран: 25 px на секунду — на 375 px видно ≈ 12 с
export const WIDE_PX = 900        // экран шире — открывается на «Монтаже»
export const MONTAGE_SCALE = 0.05 // монтаж на ПК: 50 px на секунду — реплика в 1,8 с — клип 90 px с текстом
export const MONTAGE_PHONE = 0.03
const TABS = [['montage', 'Монтаж'], ['pauses', 'Паузы'], ['ribbon', 'Лента'], ['list', 'Список'], ['listen', 'Проверка 🎧']] // у «Проверки» перед названием — светофор сценария (✅ / 🟡 / 🔴)
const vw = () => (typeof window === 'undefined' ? 0 : window.innerWidth)
const LABEL_W = 62
const EMPTY = { off: 'Игр в этом сеансе ещё не было — сыграй и вернись.', loading: 'Загружаю сохранённые игры с сервера…', ready: 'Игр в этом сеансе ещё не было, на сервере сохранённых игр тоже нет — сыграй и вернись.' }

export default function TimelineScreen({ runs = [], onClose = null, send = null, tab0 = null, server = null, server0 = null, store = null, edit0 = false, voices = null, lineApi = null, todo0 = false, pauseApi = null, knobs0 = false, check0 = null }) {
  const srv = useTimelineServer(server, server0)
  const edit = useLineEdit(lineApi) // правка реплики из карточки: текст, озвучка, свой файл (lineApi — timelineLineApi.LINE_API; null — правки нет)
  const audio = useClipAudio(voices, undefined, edit?.lines ?? null)
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
  const audit = edit?.audit ?? null
  const check = useMemo(() => checkScenario({ audit, lines: edit?.lines, orphans: edit?.orphans }), [audit, edit?.lines, edit?.orphans]) // проверка сценария из кода по текущим настройкам реплик: после каждой правки реплики пересчитывается сама
  const todo = useMemo(() => (m && audit ? voiceTodo(m, audit) : null), [m, audit])
  const marks = useMemo(() => (m && audit ? voiceMarks(m, audit) : null), [m, audit])
  const knobs = usePauseKnobs({ run, api: pauseApi, store }) // настройки пауз: что дала какая настройка в этой игре, черновик значений, проба на устройстве и применение всем (pauseApi; null — только показ)
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
        {edit && <div className="tlBody"><p className="tlMuted">Сценарий и озвучку можно проверить и без игры:</p><TimelineCheck res={check} edit={edit} audio={audio} {...check0} /></div>}
      </div>
    )
  }
  const fit = fitScale(m.dur, width - LABEL_W), scale = zoomed ?? (width < 600 ? PHONE_SCALE : DEFAULT_SCALE)
  const report = () => reportText(m, { threshold: thr, dropped: run.dropped, knobs: knobs.k })
  const knobTxt = () => (knobs.dirty ? `ПРЕДЛОЖЕННЫЕ ИЗМЕНЕНИЯ НАСТРОЕК ПАУЗ (черновик экрана, ещё не применён; ключи реестра shared/lib/scenePauses.js):\n${knobs.changes.map((x, i) => `${i + 1}. ${x.title} [${x.key}]: ${x.from} мс → ${x.to} мс`).join('\n')}` : '')
  const editsTxt = () => { const ed = draft.edits.length ? applyEdits(base, draft.edits) : null; return [ed ? editsText(draft.edits, editsSummary(base, ed), { label: cur.label, missing: ed.missing }) : '', knobTxt()].filter(Boolean).join('\n\n') }
  const go = p => { setTab('ribbon'); setSel({ kind: 'pause', ref: p }); setFocus({ t: p.t, n: (focus?.n ?? 0) + 1 }); if (bodyRef.current) bodyRef.current.scrollTop = 0 }
  // комментарий к блоку: адрес и человеческая строка — в комментарий; файл-контекст (и все события игры с сервера: её журнала на устройстве нет) — в отправку
  const block = send ? {
    head: s => blockHead(s, m, cur.rid),
    send: (s, comment, opts) => {
      const c = blockContext({ sel: s, m, run, entry: cur, edits: editsTxt(), thr, device: cur.src === 'local' ? deviceLabel() : '', appVersion: APP_VERSION, knobs: knobs.k })
      return send(comment, opts, report(), editsTxt(), [c && blockFile(c.text), cur.src === 'server' && runEventsFile(run, { label: cur.label })].filter(Boolean))
    },
  } : null
  const goLine = l => { setTab('ribbon'); setSel({ kind: 'line', ref: l }); setFocus({ t: l.t, n: (focus?.n ?? 0) + 1 }); if (bodyRef.current) bodyRef.current.scrollTop = 0 } // «Нужно озвучить»: первое появление реплики на ленте
  const pickSeg = s => { setSel(s); if (s?.kind === 'line') audio?.toggle(s.ref) } // лента: клип речи по нажатию ещё и звучит
  return (
    <div className="tl" data-testid="timeline" role="dialog" aria-label="Таймлайн игры">
      <header className="tlHead" data-testid="tl-head">
        <b className="tlTitle">🎬 Таймлайн игры</b>
        <TimelineSources entries={entries} cur={cur} onPick={k => { setPick(k); setSel(null); audio?.stop() }} srv={srv} hasServer={hasServer} />
        {send && <SendLogButton className="tlBtn" label="📤 В GitHub" send={(comment, opts) => send(comment, opts, report(), editsTxt())} onResult={setSent} data-testid="tl-send" />}
        {onClose && <button type="button" className="tlBtn" onClick={onClose} data-testid="tl-close">✕ Закрыть</button>}
      </header>
      <div className="tlBody" ref={bodyRef}>
        <div className="tlBar" data-testid="tl-bar">
          <div className="tlGroup" role="tablist">
            {TABS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className="tlChip" onClick={() => setTab(k)} data-light={k === 'listen' ? check.light ?? undefined : undefined} data-testid={`tl-tab-${k}`}>{k === 'listen' && check.ready ? `${LIGHT_ICON[check.light]} ` : ''}{t}</button>)}
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
          <TimelineVoiceTodo todo={todo} onGo={goLine} open0={todo0} />
          <button type="button" className="tlChip tlKnobsBtn" onClick={() => knobs.show()} data-dirty={knobs.dirty ? '1' : undefined} title="Паузы сценария игры: посмотреть, изменить, попробовать на этом устройстве или применить всем" data-testid="tl-knobs-btn">⚙ Настройки пауз{knobs.dirty ? ` · черновик ${knobs.changes.length}` : ''}</button>
          <p className="tlSum" data-testid="tl-sum">
            {entries.length === 1 && !hasServer && <span>{cur.label} · </span>}Прохождение <b>{dur(sum.dur)}</b> · Пит {dur(sum.speak.pit)} · Мия {dur(sum.speak.mia)} · диктор {dur(sum.speak.dictor)} · ждали игрока {dur(sum.player)} · <span className="tlRed">игра молчала {dur(sum.dead)}, долгих пауз {sum.longCount}</span>
            {overridesText(knobs.overrides) && <span className="tlKnobDiff" data-testid="tl-run-knobs"> · в этой игре изменены паузы: {overridesText(knobs.overrides)}</span>}
            {run.dropped > 0 && <span className="tlRed"> · начало трассы вытеснено ({run.dropped} соб.)</span>}
          </p>
        </div>
        {sent && <p className="tlMuted" data-testid="tl-sent">{sent}</p>}
        {tab === 'montage' && <TimelineMontage key={cur.key} base={base} draft={draft} scale0={vw() && vw() < 600 ? MONTAGE_PHONE : MONTAGE_SCALE} labelW={width < 600 ? 58 : 92} send={send ? (comment, opts, text) => send(comment, opts, report(), text) : null} edit0={edit0} label={cur.label} audio={audio} block={block} rows={list} lineEdit={edit} voiceMarks={marks} knobs={knobs} />}
        {tab === 'pauses' && <TimelinePausesTab key={cur.key} pauses={pauses} total={sum.dur} onGo={go} block={block} knobs={knobs} />}
        {tab === 'ribbon' && <TimelineRibbon m={m} pauses={pauses} scale={Math.max(scale, fit)} focus={focus} selected={sel} onPick={pickSeg} />}
        {tab === 'listen' && <TimelineCheck key={cur.key} m={m} res={check} edit={edit} audio={audio} {...check0} />}
        {tab === 'list' && <TimelineList rows={list} pauses={pauses} selected={sel} onPick={setSel} />}
        {tab === 'ribbon' && <p className="tlLegend">{[['pit', 'Пит'], ['mia', 'Мия'], ['dictor', 'диктор — слово, перевод, фраза голосом Пита'], ['silent', 'без озвучки (подпись)'], ['dead', 'игра молчит дольше порога']].map(([k, t]) => <span key={k}><i data-who={k} />{t}</span>)}</p>}
        {tab !== 'list' && tab !== 'montage' && tab !== 'listen' && <TimelineActs sum={sum} />}
      </div>
      {tab !== 'pauses' && tab !== 'montage' && tab !== 'listen' && <TimelineCard sel={sel} rows={list} onClose={() => { setSel(null); audio?.stop() }} audio={audio} block={block} edit={edit} knobs={knobs} />}
      <TimelineKnobsPanel knobs={knobs0 && !knobs.open ? { ...knobs, open: true } : knobs} />
    </div>
  )
}
