import MemoryPhraseRow from './MemoryPhraseRow.jsx'
import MemoryStartedRow from './MemoryStartedRow.jsx'

// «Вся коллекция» / «Все начатые» — окно со всем списком фраз (та же шторка с «пружинкой», что и окно слова).
// Тап по выученной фразе — её карточка, по начатой — схема модуля. started — окно начатых фраз
export default function MemoryPhrasesSheet({ list, today, started = false, onOpen, onClose }) {
  const title = started ? 'Мои начатые фразы' : 'Мои выученные фразы'
  return (
    <div className="lrSheetBack" onClick={onClose}>
      <div className="lrSheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <p className="lrSheetWord">{title} · {list.length}</p>
        <div className="memPhrasesScroll">
          {list.map(p => (started
            ? <MemoryStartedRow key={p.id} p={p} onClick={onOpen} />
            : <MemoryPhraseRow key={p.id} p={p} today={today} onClick={onOpen} />))}
        </div>
        <button className="lrBtn lrBtnGhost" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}
