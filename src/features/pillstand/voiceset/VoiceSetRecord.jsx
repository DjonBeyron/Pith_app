import { SECTION_TITLE } from './voiceSetPlan.js'

// Запись клипа «Записи набора» на 375 px: прогресс «37 / 255», раздел; крупно — что сказать, задание по-русски и пример обрубка; полоса окна записи (CSS-анимация длиной в окно, без перерисовок
// React); индикатор уровня (пишется в DOM из захвата: --lv и data-voice — «голос слышно»); предупреждение о прошлом клипе; следующее задание; кнопки «Пауза / Продолжить», «Переписать прошлый»,
// «Пропустить», «Закончить». Микрофон отключился — красная плашка «нажми» (getUserMedia в жесте). Звуков нет. Состояние — useVoiceSet (v.st — состояние хода, voiceSetSession.js).
const PHASE = { gap: 'приготовься…', rec: '● говори', saving: 'сохраняю…', paused: 'пауза', hold: 'пауза', idle: '', done: '' }
const WARN = { novoice: 'В прошлом клипе голоса не было слышно', late: 'В прошлом клипе слово не уместилось в окно' }
const PAUSE = { user: 'Пауза. Нажми «Продолжить» — запись пойдёт с этого задания', hidden: 'Страница уходила в фон — запись на паузе', mic: 'Микрофон отключился — клип будет переписан', save: 'Клип не сохранился' }
const brief = it => (it ? `${it.text}${it.task ? ` — ${it.task}` : ''}` : 'конец набора')
const size = t => (t.length > 16 ? 'xs' : t.length > 11 ? 's' : t.length > 7 ? 'm' : 'l')

export default function VoiceSetRecord({ v, levelRef }) {
  const st = v.st
  if (!st?.item) return <div className="vsBody" data-testid="vs-record"><p className="vsDim">Готовлю запись…</p></div>
  const it = st.item, stopped = st.phase === 'paused' || st.phase === 'hold', cut = it.hint && it.hint !== it.text
  const micDown = v.health.state !== 'ok'
  return (
    <div className="vsBody vsRec" data-phase={st.phase} data-i={st.i} data-kind={it.kind} data-text={it.text} data-variant={it.variant} data-rep={it.rep} data-far={it.far ? '1' : undefined} data-key={st.recKey} data-testid="vs-record">
      <div className="vsProg">
        <b data-testid="vs-progress">{st.done} / {st.total}</b>
        <span>{SECTION_TITLE[it.section] ?? ''}{it.kind === 'word' ? ` · повтор ${it.rep}` : ''}{st.skipped ? ` · пропущено ${st.skipped}` : ''}</span>
      </div>
      <div className="vsProgBar"><i style={{ width: `${Math.round((st.done + st.skipped) / st.total * 1000) / 10}%` }} /></div>
      <div className="vsStage">
        <span className="vsPhase" data-testid="vs-phase">{PHASE[st.phase]}</span>
        <div className="vsWord" data-size={size(it.text)} data-testid="vs-word">{it.text}</div>
        <p className="vsTask" data-testid="vs-task">{it.task}</p>
        {cut && <p className="vsHint" data-testid="vs-hint">скажи: <b>{it.hint}</b></p>}
        <div className="vsWin" data-on={st.phase === 'rec' ? '1' : undefined}>{st.phase === 'rec' && <i key={st.recKey} style={{ animationDuration: `${it.ms}ms` }} />}</div>
        <div className="vsLevel" ref={levelRef} data-testid="vs-level"><i /><span>голос слышно</span></div>
      </div>
      {st.warn && !stopped && <p className="vsWarn" data-testid="vs-warn">⚠ {WARN[st.warn.kind]} — нажми «Переписать прошлый»</p>}
      {st.phase === 'hold' && <p className="vsWarn" data-testid="vs-hold">{it.hold}</p>}
      {st.phase === 'paused' && <p className="vsWarn" data-testid="vs-paused">{PAUSE[st.pauseWhy] ?? 'Пауза'}{st.error ? `: ${st.error}` : ''}</p>}
      <p className="vsNext" data-testid="vs-next">дальше: {brief(st.after)}</p>
      {micDown && (v.health.state === 'tap'
        ? <button type="button" className="psMicDead" onClick={v.micTap} data-testid="vs-mic-dead">Микрофон отключился — нажми, чтобы включить</button>
        : <p className="psMicNote" data-testid="vs-mic-reviving">микрофон отключился — включаю заново…</p>)}
      <div className="vsBtns">
        {stopped
          ? <button type="button" className="vsBtn vsBtn--go" onClick={v.cmd.resume} disabled={micDown} data-testid="vs-resume-rec">▶ Продолжить</button>
          : <button type="button" className="vsBtn" onClick={v.cmd.pause} data-testid="vs-pause">⏸ Пауза</button>}
        <button type="button" className="vsBtn" onClick={v.cmd.redo} disabled={!st.canRedo} data-testid="vs-redo">↩ Переписать прошлый</button>
        <button type="button" className="vsBtn" onClick={v.cmd.skip} disabled={st.phase === 'saving'} data-testid="vs-skip">⏭ Пропустить</button>
        <button type="button" className="vsBtn" onClick={v.cmd.finish} data-testid="vs-finish">■ Закончить</button>
      </div>
    </div>
  )
}
