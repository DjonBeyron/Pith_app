import FeedItem from './FeedItem.jsx'
import { answerText } from './lessonTranscript.js'

const SKIP = new Set(['highlights', 'proHighlights', 'r2Url', 'crop'])
const short = v => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 140 ? `${s.slice(0, 137)}…` : s
}

// Средняя колонка (v1, только чтение): нода в фокусе — как она выглядит и все её параметры. Редактор «как на канвасе» — следующий этап
export default function NodeFacts({ node, nodes, warnings }) {
  if (!node) return <div className="rvwEmpty">Выбери сообщение в ленте — здесь появятся все параметры ноды</div>
  const seqOf = ref => nodes.find(n => n.ref === ref)?.seq ?? ref
  const fields = Object.entries(node.data ?? {}).filter(([k, v]) => !SKIP.has(k) && v !== '' && v != null)
  return (
    <div className="rvwFacts">
      <div className="rvwFactsHead">Нода {node.seq} · {node.type} <span className="rvwRef">{node.ref}</span></div>
      <FeedItem item={{ kind: 'node', node, choice: null }} selected={false} onSelect={() => {}} onChoice={() => {}} />
      {answerText(node) && <div className="rvwFact"><b>верный ответ:</b> {answerText(node)}</div>}
      {warnings.length > 0 && <div className="rvwFactWarns">{warnings.map((w, i) => <div key={i}>{w}</div>)}</div>}
      <div className="rvwFactsTitle">Параметры</div>
      {fields.map(([k, v]) => <div key={k} className="rvwFact"><b>{k}:</b> {short(v)}</div>)}
      <div className="rvwFactsTitle">Переходы</div>
      {(node.triggers ?? []).map((t, i) => <div key={i} className="rvwFact"><b>{t.if}</b> → {t.then ? `нода ${seqOf(t.then)}` : 'конец'}{t.ms ? ` · ${t.ms} мс` : ''}</div>)}
      {node.note && <><div className="rvwFactsTitle">Заметка</div><div className="rvwFact">{node.note}</div></>}
    </div>
  )
}
