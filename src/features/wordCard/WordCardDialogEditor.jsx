import { DEFAULT_LEFT, DEFAULT_RIGHT } from './wordCardModel.js'

// Редактор блока «Пример диалога»: имена слева и справа (по умолчанию Пит и Анна),
// реплики — чья (переключатель стороны), английский текст со **звёздочками**,
// перевод, галочка «отрицание» (слова не/not в реплике ученик увидит янтарными)
const MAX_LINES = 12

export default function WordCardDialogEditor({ b, onChange }) {
  const setLine = (i, patch) => onChange({ lines: b.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) })
  const swapSides = () => onChange({ left: b.right, right: b.left, lines: b.lines.map(l => ({ ...l, side: l.side === 'r' ? 'l' : 'r' })) })
  return (
    <>
      <div className="wcEdRow">
        <label className="wcEdSel">Слева <input className="wcEdIn wcEdName" value={b.left} maxLength={20} placeholder={DEFAULT_LEFT} onChange={e => onChange({ left: e.target.value })} /></label>
        <label className="wcEdSel">Справа <input className="wcEdIn wcEdName" value={b.right} maxLength={20} placeholder={DEFAULT_RIGHT} onChange={e => onChange({ right: e.target.value })} /></label>
        <button className="wcEdBtn" onClick={swapSides} title="Поменять имена и стороны всех реплик">⇄ поменять стороны</button>
      </div>
      {b.lines.map((l, i) => (
        <div key={i} className={'wcEdLine' + (l.side === 'r' ? ' wcEdLineR' : '')}>
          <div className="wcEdRow">
            <button
              className="wcEdSide"
              onClick={() => setLine(i, { side: l.side === 'r' ? 'l' : 'r' })}
              title="Нажми, чтобы переключить, кто говорит"
            >{l.side === 'r' ? (b.right || DEFAULT_RIGHT) : (b.left || DEFAULT_LEFT)}</button>
            <label className="wcEdChk"><input type="checkbox" checked={l.neg} onChange={e => setLine(i, { neg: e.target.checked })} /> отрицание</label>
            <button className="wcEdMini" onClick={() => onChange({ lines: b.lines.filter((_, k) => k !== i) })} aria-label={`Убрать реплику ${i + 1}`}>✕</button>
          </div>
          <input className="wcEdIn" value={l.text} maxLength={200} placeholder="English, слово в **звёздочках**" onChange={e => setLine(i, { text: e.target.value })} />
          <input className="wcEdIn" value={l.tr} maxLength={200} placeholder="Перевод на русский" onChange={e => setLine(i, { tr: e.target.value })} />
        </div>
      ))}
      <div className="wcEdRow">
        <button
          className="wcEdBtn"
          disabled={b.lines.length >= MAX_LINES}
          onClick={() => onChange({ lines: [...b.lines, { side: b.lines.at(-1)?.side === 'l' ? 'r' : 'l', text: '', tr: '', neg: false }] })}
        >＋ реплика</button>
      </div>
    </>
  )
}
