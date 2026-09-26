import MemoryWordChip from './MemoryWordChip.jsx'

// «Все слова ступени» (по числу, названию или ⤢ ступени): вкладки трёх
// ступеней с числами — переключаться, не возвращаясь; шапка ступени — что
// это за слова и когда спросим; список слов (MemoryWordChip, строкой).
// level — 1..3, onLevel — сменить ступень, onWord — шторка слова
export default function MemoryLevelPage({ ladder, level, onLevel, onWord, onBack }) {
  const cur = ladder.levels[level - 1]
  return (
    <div className="memPage">
      <div className="memPageTop">
        <button className="memBack" onClick={onBack}>← Назад</button>
        <h1 className="lrTitle">Моя память</h1>
      </div>
      <div className="memTabs" role="tablist">
        {ladder.levels.map(l => (
          <button key={l.id} role="tab" aria-selected={l.id === level}
            className={`memTab memTab--${l.id}`} onClick={() => onLevel(l.id)}>
            <b>{l.words.length}</b>{l.short}
          </button>
        ))}
      </div>
      <div className={`memHead memHead--${level}`}>
        <b>{cur.name}</b>
        <p>{cur.about}</p>
        <div className="memHeadWhen">{cur.when}</div>
      </div>
      <div className="memList">
        {cur.words.map(w => <MemoryWordChip key={w.word} w={w} row onClick={onWord} />)}
        {!cur.words.length && <p className="memListEmpty">Здесь пока пусто</p>}
      </div>
    </div>
  )
}
