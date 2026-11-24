import { useEffect, useMemo, useRef, useState } from 'react'
import { useListenQueue } from '../useListenQueue.js'
import { dur } from '../timelineFormat.js'
import { LIGHT_ICON, headLine } from './scenarioCheck.js'
import { checkReportText } from './checkReport.js'
import ScenarioItem from './ScenarioItem.jsx'
import ScenarioExtras from './ScenarioExtras.jsx'
import { APP_VERSION } from '../../../shared/lib/version.js'

// «Сценарий сейчас (все ветки)» — проверка и прослушивание сценария «Встряхни память» ИЗ КОДА, без прохождения (CONCEPT_TIMELINE.md, «Проверка сценария»). Сверху строка-светофор по всему сценарию и по блокам
// и список «Что сделать» простыми словами; ниже блоки в порядке игры: части («подряд» / «одна из»), реплики со значками состояния (ScenarioItem — нажатие открывает карточку правки).
// «▶ Весь сценарий подряд» и «▶ Блок» играют основной путь без пауз (варианты «одна из» — все подряд; ветки «Пальцами» и страховки — только с их реплики). «Только проблемы» прячет зелёное.
// res — scenarioCheck.checkScenario (считает экран: тот же итог — на вкладке); edit — useLineEdit (правка и копирование); audio — звук клипов экрана (останавливается перед очередью); make — подмена <audio> в тестах.
const RATES = [1, 1.25, 1.5]
const KIND = { variants: 'одна из', branch: 'одна из' }
const fine = x => x.check.level === 'ok' || x.check.level === 'skip'

export default function TimelineScenario({ res, edit, audio = null, make, only0 = false, open0 = null }) {
  const q = useListenQueue(make)
  const [only, setOnly] = useState(only0)
  const [open, setOpen] = useState(open0) // ключ раскрытой реплики
  const [note, setNote] = useState('')
  const nowRef = useRef(null)
  const live = q.st.status === 'playing' || q.st.status === 'loading' || q.st.status === 'paused'
  useEffect(() => { nowRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [q.st.key])
  const urlOf = x => (x.check.status === 'ok' ? edit?.lines?.[x.id]?.url ?? null : null)
  const rows = useMemo(() => res.blocks.flatMap(b => b.parts.flatMap(p => p.items.map(x => ({ key: `${b.key}/${p.key}/${x.id}`, url: x.check.status === 'ok' ? edit?.lines?.[x.id]?.url ?? null : null, block: b.key, part: p.key, main: !p.alt && !x.again })))), [res.blocks, edit?.lines])
  if (!res.ready) return <p className="tlMuted" data-testid="tl-ck-loading">{edit?.status === 'error' ? `Настройки реплик не загрузились: ${edit.loadError}` : 'Загружаю настройки реплик…'}</p>
  const play = (list, key) => { audio?.stop?.(); const items = list.filter(r => r.url); q.start(items, Math.max(0, key ? items.findIndex(r => r.key === key) : 0)) }
  const main = rows.filter(r => r.main), total = res.blocks.reduce((a, b) => a + b.sec, 0)
  const playFrom = (b, p, key) => play(p.alt ? rows.filter(r => r.block === b.key && r.part === p.key) : main.filter(r => r.block === b.key).concat(rows.filter(r => r.key === key && !r.main)), key)
  const copy = async () => { const ok = await edit?.copy?.(checkReportText(res, { version: APP_VERSION })); setNote(ok ? '✓ отчёт проверки скопирован — вставь его в чат' : '✗ буфер обмена недоступен') }
  const todo = res.actions.filter(a => a.k !== 'orphans')
  return (
    <div className="tlCk" data-testid="tl-ck" data-light={res.light}>
      <div className="tlCkTop" data-light={res.light} data-testid="tl-ck-top">
        <b className="tlCkSum" data-testid="tl-ck-sum">{LIGHT_ICON[res.light]} {headLine(res)}</b>
        <div className="tlCkLights" data-testid="tl-ck-lights">
          {res.blocks.map(b => <a key={b.key} className="tlCkLight" data-light={b.light} href={`#tl-ck-${b.key}`} onClick={e => { e.preventDefault(); document.getElementById(`tl-ck-${b.key}`)?.scrollIntoView?.({ block: 'start' }) }}>{LIGHT_ICON[b.light]} {b.title}{b.bad ? ` · ${b.bad}` : ''}</a>)}
        </div>
        {todo.length > 0 && <ul className="tlCkActs" data-testid="tl-ck-acts">{todo.map(a => <li key={a.k} data-level={a.level}>{a.text}</li>)}</ul>}
        {res.need.length > 0 && <p className="tlMuted" data-testid="tl-ck-need">Нужно озвучить или переозвучить: {res.need.length} — то же число горит на вкладке админки «Голос». Нажми реплику ниже → «🎙 Озвучить заново» или «📁 Выбрать файл…».</p>}
      </div>
      <div className="tlListenBar">
        <button type="button" className="tlBtn" onClick={() => play(main)} disabled={!main.some(r => r.url)} data-testid="tl-ck-all">▶ Весь сценарий подряд ({dur(total * 1000)})</button>
        {live && <button type="button" className="tlBtn" onClick={() => (q.st.status === 'paused' ? q.resume() : q.pause())} data-testid="tl-ck-pause">{q.st.status === 'paused' ? '▶ Дальше' : '⏸ Пауза'}</button>}
        {live && <button type="button" className="tlBtn" onClick={q.prev} aria-label="Предыдущая реплика">⏮</button>}
        {live && <button type="button" className="tlBtn" onClick={q.next} aria-label="Следующая реплика">⏭</button>}
        {live && <button type="button" className="tlBtn" onClick={q.stop} data-testid="tl-ck-stop">■ Стоп (Esc)</button>}
        <span className="tlGroup" role="radiogroup" aria-label="Скорость">{RATES.map(r => <button key={r} type="button" role="radio" aria-checked={q.rate === r} className="tlChip" onClick={() => q.setRate(r)}>{String(r).replace('.', ',')}×</button>)}</span>
        <label className="tlCkOnly"><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)} data-testid="tl-ck-only" /> только проблемы</label>
        <button type="button" className="tlBtn" onClick={copy} data-testid="tl-ck-copy">📋 Скопировать отчёт проверки</button>
        {live && <span className="tlMuted" data-testid="tl-ck-now">реплика {q.st.index + 1} из {q.st.total}</span>}
        {note && <span className="tlMuted" data-testid="tl-ck-note">{note}</span>}
      </div>
      <p className="tlMuted">Подряд играет основной путь без пауз игры; где написано «одна из» — звучат все варианты. Слова и фразы урока говорит диктор — их здесь нет.</p>
      {q.st.status === 'error' && <p className="tlRed" role="status">{q.st.error}</p>}
      {q.st.skipped.length > 0 && <p className="tlRed" role="status">не загрузились и пропущены: {q.st.skipped.length}</p>}
      {only && !todo.length && <p className="tlCkGood" data-testid="tl-ck-clean">✅ Проблем нет — показывать нечего. Сними «только проблемы», чтобы увидеть весь сценарий.</p>}
      {res.blocks.map(b => {
        const parts = b.parts.map(p => ({ ...p, shown: only ? p.items.filter(x => !fine(x) && !x.again) : p.items })).filter(p => p.shown.length)
        if (!parts.length) return null
        return (
          <section key={b.key} id={`tl-ck-${b.key}`} className="tlLBlock tlCkBlock" data-light={b.light} data-testid="tl-ck-block">
            <header className="tlLHead">
              <b>{LIGHT_ICON[b.light]} {b.title}</b>
              <span className="tlMuted">{b.bad ? `требуют внимания ${b.bad} из ${b.total}` : `все ${b.total} в порядке`} · {dur(b.sec * 1000)}</span>
              <button type="button" className="tlBtn tlLGo" disabled={!main.some(r => r.block === b.key && r.url)} onClick={() => play(main.filter(r => r.block === b.key))} data-testid="tl-ck-block-play">▶ Блок</button>
            </header>
            {b.note && <p className="tlMuted">{b.note}</p>}
            {parts.map(p => (
              <div key={p.key} className="tlCkPart" data-kind={p.kind} data-alt={p.alt ? '1' : undefined}>
                <p className="tlCkPartHead">{KIND[p.kind] && <i className="tlCkBadge">{KIND[p.kind]}</i>}{p.alt && <i className="tlCkBadge tlCkAlt">ветка</i>} {p.title}</p>
                <ol className="tlLList">
                  {p.shown.map(x => {
                    const key = `${b.key}/${p.key}/${x.id}`, on = live && q.st.key === key
                    return <ScenarioItem key={key} x={x} open={open === key} on={on} playable={!!urlOf(x)} innerRef={on ? nowRef : null} onToggle={() => setOpen(open === key ? null : key)} onPlay={() => playFrom(b, p, key)} edit={edit} />
                  })}
                </ol>
              </div>
            ))}
          </section>
        )
      })}
      <ScenarioExtras res={res} />
    </div>
  )
}
