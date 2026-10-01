import { parseMarks, splitNeg } from './wordCardModel.js'

// Блоки справки слова глазами ученика (PROJECT.md → «Макет «Карточка слова»»). Один
// компонент и для карточки слова в приложении, и для превью в редакторе «Справка».
// Рисует блоки подряд внутри .wcMid — единственной прокручиваемой области карточки
// (диалог своего скролла не имеет, word-card.css). Выделение **слов** — лаймом,
// отрицание в репликах с галочкой «отрицание» — янтарным

// **текст** → строка с <b>; neg — ещё и янтарное отрицание (lang 'en' | 'ru')
function Marked({ text, neg = false, lang = 'en' }) {
  return parseMarks(text).map((p, i) => {
    if (p.bold) return <b key={i}>{p.text}</b>
    if (!neg) return <span key={i}>{p.text}</span>
    return splitNeg(p.text, lang).map((q, j) => (q.neg ? <em key={`${i}-${j}`} className="wcNeg">{q.text}</em> : <span key={`${i}-${j}`}>{q.text}</span>))
  })
}

function Table({ b }) {
  return (
    <div className="wcBub wcBub--tbl">
      <table className="wcTbl">
        <thead><tr>{b.head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i} className={b.mark === i ? 'wcMark' : undefined}>
              {r.map((c, j) => (
                <td key={j}>{c}{b.mark === i && j === 1 && <small>в вашей фразе</small>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Formula({ b }) {
  const parts = b.parts.filter(Boolean)
  return (
    <div className="wcBub wcBub--fm">
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="wcOp">+</span>}
          <span className="wcChip">{p}</span>
        </span>
      ))}
      {b.result && <><span className="wcOp">=</span><span className="wcChip wcChip--res">{b.result}</span></>}
    </div>
  )
}

function Cases({ b }) {
  return (
    <div className="wcBub wcBub--cs">
      {b.items.map((it, i) => (
        <div key={i} className={it.mark ? 'wcCase wcCase--mark' : 'wcCase'}>
          <span>{it.label}{it.mark && ' · в вашей фразе'}</span>
          <p><Marked text={it.example} /></p>
          {it.tr && <small>{it.tr}</small>}
        </div>
      ))}
    </div>
  )
}

function Dialog({ b }) {
  return (
    <div className="wcDlg">
      <div className="wcDlgLabel">Пример диалога</div>
      <div className="wcDlgScroll">
        {b.lines.map((l, i) => (
          <div key={i} className={l.side === 'r' ? 'wcMsg wcMsg--r' : 'wcMsg'}>
            <div className={l.side === 'r' ? 'wcBub wcBub--me' : 'wcBub'}>
              <span className="wcWho">{l.side === 'r' ? b.right : b.left}</span>
              <Marked text={l.text} neg={l.neg} lang="en" />
              {l.tr && <small><Marked text={l.tr} neg={l.neg} lang="ru" /></small>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function WordCardBlocks({ nodes }) {
  return nodes.map(b => {
    switch (b.type) {
      case 'table': return <Table key={b.id} b={b} />
      case 'formula': return <Formula key={b.id} b={b} />
      case 'cases': return <Cases key={b.id} b={b} />
      case 'dialog': return <Dialog key={b.id} b={b} />
      default: return <div key={b.id} className="wcBub"><Marked text={b.text} /></div>
    }
  })
}
