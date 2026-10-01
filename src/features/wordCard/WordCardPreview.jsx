import WordCardBlocks from './WordCardBlocks.jsx'
import { cleanForSave } from './wordCardModel.js'

// Превью справки в редакторе: карточка слова такой, какой её увидит ученик (шапка
// и подвал-заглушки, блоки — те же, что в приложении). Пустые блоки не показываются
export default function WordCardPreview({ title, tag, nodes }) {
  const shown = cleanForSave({ tag, nodes })
  return (
    <aside className="wcEdPreview" aria-label="Так увидит ученик">
      <div className="wcEdPreviewLabel">Так увидит ученик</div>
      <div className="wcCard wcCard--preview">
        <div className="wcHead">
          <div className="wcTop"><span className="wcTag">{shown?.tag || 'слово'}</span></div>
          <div className="wcWordRow"><h3 className="wcWord">{title || 'слово'}</h3></div>
        </div>
        <div className="wcMid">
          {shown ? <WordCardBlocks nodes={shown.nodes} /> : <p className="wcNote">Блоков пока нет</p>}
        </div>
        <div className="wcFoot">
          <div className="wcActs">
            <span className="lrBtn lrBtnMain">Пройти урок слова</span>
            <span className="lrBtn lrBtnGhost">Закрыть</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
