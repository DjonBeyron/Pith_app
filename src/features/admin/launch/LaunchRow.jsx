import { useState } from 'react'

// Одна строка вкладки «Запуск»: название, есть / нужно / не хватает, «зачем» и раскрываемый список нехватки.
const MARK = { ok: '✓', fail: '✕', nodata: '?', info: 'i' }

function have(r) {
  if (r.status === 'nodata' || r.have == null) return 'нет данных'
  if (r.kind === 'bool') return r.have ? 'да' : 'нет'
  if (r.kind === 'percent') return `${r.have}%`
  return r.have
}

function need(r) {
  if (r.need == null) return '—'
  if (r.kind === 'bool') return 'все 3'
  return `${r.limit === 'max' ? '≤ ' : '≥ '}${r.need}${r.kind === 'percent' ? '%' : ''}`
}

function lack(r) {
  if (r.status === 'ok') return '✓'
  if (r.status !== 'fail') return '—'
  if (r.kind === 'percent') return `ещё ${r.missing} шт.`
  if (r.kind === 'bool') return `выключено: ${r.missing}`
  return r.limit === 'max' ? `лишних: ${r.missing}` : r.missing
}

export default function LaunchRow({ row: r }) {
  const [open, setOpen] = useState(false)
  const info = r.status === 'info'
  return (
    <section className={`lnRow lnRow_${r.status}`}>
      <div className="lnTop">
        <span className="lnMark" aria-hidden="true">{MARK[r.status]}</span>
        <span className="lnTitle">{r.title}</span>
      </div>
      <div className="lnNums">
        <span><i>есть</i> <b>{have(r)}</b>{r.kind === 'percent' && r.total ? ` (${r.count} из ${r.total})` : ''}</span>
        {!info && <span><i>нужно</i> <b>{need(r)}</b></span>}
        {!info && <span><i>не хватает</i> <b>{lack(r)}</b></span>}
      </div>
      <p className="lnWhy">{r.why}</p>
      {r.status === 'fail' && r.hint && <p className="lnHint">{r.hint}</p>}
      {r.note && <p className="lnNote">{r.note}</p>}
      {r.items.length > 0 && (
        <>
          <button className="lnToggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {open ? '▾' : '▸'} {r.itemsLabel} ({r.items.length})
          </button>
          {open && (
            <ul className="lnItems">
              {r.items.map(i => (
                <li key={i.id}>
                  <span className="lnItemTitle">{i.title}</span>
                  {i.id !== i.title && <code className="lnItemId">{i.id}</code>}
                  {i.note && <em className="lnItemNote">{i.note}</em>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
