import { useState } from 'react'
import { gapInfo, limitsFor } from './montageEdits.js'
import { editShort, gapText, GAP_KIND, MODE, WHY } from './montageEditsText.js'
import { dur, WHO, clock } from '../timelineFormat.js'
import SendLogButton from '../../../shared/ui/SendLogButton.jsx'

// Боковая панель режима «Правка»: честная надпись (черновик — игра не меняется), правка выбранного зазора числом и быстрыми кнопками, СПИСОК ПРАВОК (каждую можно убрать отдельно), «сбросить всё»,
// «скопировать список» и «📤 Правки в GitHub» (список уходит файлом вместе с логами). Отмена / возврат — в панели инструментов монтажа и клавишами.
// apply(key, to) → { to, hit, why } — поставить зазор перед клипом (пределы — montageEdits.limitsFor); revert(key) — убрать правку клипа; text() — список правок текстом; send(comment, opts, text) — отправка.
const secs = s => { const n = Number(String(s).replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n * 1000 : null }

function GapEditor({ base, edits, sel, mode, apply, revert }) {
  const info = gapInfo(base, sel), edit = edits.find(e => e.key === sel) ?? null, cur = edit ? edit.to : info.from
  const [val, setVal] = useState(null) // null — в поле текущее значение
  const [note, setNote] = useState('')
  const lim = limitsFor(base, edits, sel, edit?.mode ?? mode)
  const put = to => { const r = apply(sel, to); setVal(null); setNote(r?.hit ? WHY[r.why] ?? WHY.max : '') }
  const c = info.clip
  return (
    <div className="mtgGapEd" data-testid="mtg-gap-editor">
      <p className="mtgEdTitle">Тишина перед <b data-who={c.who}>{WHO[c.who] ?? c.who} «{c.text}»</b></p>
      <p className="mtgMutedLine">после {info.prev ? `${WHO[info.prev.who] ?? info.prev.who} «${info.prev.text}»` : 'начала игры'} · было {gapText(info.from)}{edit ? <> → стало <b>{gapText(edit.to)}</b></> : ''}</p>
      {info.inside.length > 0 && <p className="mtgMutedLine">внутри не двигается: {info.inside.map(p => `${GAP_KIND[p.kind] ?? p.kind} ${dur(p.ms)}`).join(', ')} — меньше {dur(lim.min)} не сделать</p>}
      <form className="mtgEdRow" onSubmit={e => { e.preventDefault(); const ms = secs(val ?? ''); if (ms != null) put(ms) }}>
        <label>сделать <input className="mtgInput" inputMode="decimal" value={val ?? (cur / 1000).toFixed(2).replace('.', ',')} onChange={e => setVal(e.target.value)} aria-label="Новая длина зазора, секунд" data-testid="mtg-gap-input" /> с</label>
        <button type="submit" className="tlChip" data-testid="mtg-gap-apply">применить</button>
      </form>
      <div className="mtgEdRow">
        <button type="button" className="tlChip" onClick={() => put(cur - 500)} data-testid="mtg-gap-minus">−0,5 с</button>
        <button type="button" className="tlChip" onClick={() => put(cur + 500)}>+0,5 с</button>
        <button type="button" className="tlChip" onClick={() => put(300)} data-testid="mtg-gap-03">до 0,3 с</button>
        <button type="button" className="tlChip" onClick={() => { revert(sel); setVal(null); setNote('') }} disabled={!edit} data-testid="mtg-gap-revert">вернуть</button>
      </div>
      {note && <p className="mtgWarn" data-testid="mtg-gap-note">{note}</p>}
    </div>
  )
}

export default function MontageEditsPanel({ base, draft, missing = [], sel = null, mode, apply, revert, onGoto, text, send = null, summary }) {
  const [info, setInfo] = useState('')
  const edits = draft.edits, gone = new Set(missing.map(e => e.key))
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); setInfo('✓ Список скопирован') } catch { setInfo('✗ Буфер обмена недоступен — выдели текст списка вручную') }
  }
  return (
    <section className="mtgEdits" data-testid="mtg-edits">
      <p className="mtgHonest" data-testid="mtg-honest">Это черновик монтажа: игра от него не меняется. Список правок уходит разработчику.</p>
      <h4 className="mtgH">Список правок <small data-testid="mtg-edits-count">{edits.length}</small></h4>
      <p className="mtgSumLine" data-testid="mtg-edits-sum">{summary}</p>
      {edits.length === 0 && <p className="mtgMutedLine">Правок пока нет.</p>}
      <ol className="mtgEditList">
        {edits.map(e => (
          <li key={e.key} data-testid="mtg-edit" data-missing={gone.has(e.key) ? '1' : undefined}>
            <button type="button" className="mtgEditGo" onClick={() => onGoto(e)} title="Показать на столе">{editShort(e)}<small> · {MODE[e.mode]} · на {clock(e.at ?? 0)}{e.to < -1 ? ' · ⚠ звучат одновременно' : ''}{gone.has(e.key) ? ' · в этой игре такого клипа нет' : ''}</small></button>
            <button type="button" className="tlChip mtgEditDel" onClick={() => revert(e.key)} aria-label="Убрать эту правку" title="Убрать эту правку" data-testid="mtg-edit-del">✕</button>
          </li>
        ))}
      </ol>
      <div className="mtgEdRow">
        <button type="button" className="tlChip" onClick={draft.reset} disabled={!edits.length} data-testid="mtg-reset">сбросить всё</button>
        <button type="button" className="tlChip" onClick={copy} disabled={!edits.length} data-testid="mtg-copy">скопировать список</button>
        {send && <SendLogButton className="tlChip" label="📤 Правки в GitHub" send={(comment, opts) => send(comment, opts, text())} onResult={setInfo} data-testid="mtg-send" />}
      </div>
      {info && <p className="mtgMutedLine" data-testid="mtg-info">{info}</p>}
      {sel && gapInfo(base, sel) ? <GapEditor key={sel} base={base} edits={edits} sel={sel} mode={mode} apply={apply} revert={revert} /> : <p className="mtgMutedLine">Тяни клип влево-вправо — меняется тишина перед ним. Или нажми на клип / зазор и задай тишину числом.</p>}
      {draft.srv && <p className="mtgMutedLine" data-testid="mtg-srv">{draft.srv === 'busy' ? '☁ черновик сохраняется на сервер…' : draft.srv === 'ok' ? '☁ черновик сохранён на сервере' : `☁ на сервер не сохранилось (${draft.srv}) — черновик остаётся на этом устройстве`}</p>}
    </section>
  )
}
