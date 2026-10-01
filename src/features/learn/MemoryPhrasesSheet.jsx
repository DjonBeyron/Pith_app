import MemoryPhraseRow from './MemoryPhraseRow.jsx'

// «Вся коллекция» — окно со всем списком выученных фраз (та же шторка с
// «пружинкой», что и окно слова). Тап по фразе — её карточка
export default function MemoryPhrasesSheet({ list, today, onOpen, onClose }) {
  return (
    <div className="lrSheetBack" onClick={onClose}>
      <div className="lrSheet" role="dialog" aria-label="Мои выученные фразы" onClick={e => e.stopPropagation()}>
        <p className="lrSheetWord">Мои выученные фразы · {list.length}</p>
        <div className="memPhrasesScroll">
          {list.map(p => <MemoryPhraseRow key={p.id} p={p} today={today} onClick={onOpen} />)}
        </div>
        <button className="lrBtn lrBtnGhost" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}
