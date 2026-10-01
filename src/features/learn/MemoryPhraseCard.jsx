import { Star } from 'lucide-react'
import MemoryWordChip from './MemoryWordChip.jsx'
import { phraseDateLabel, PHRASE_LOST_TEXT } from './phraseList.js'

// Карточка закреплённой фразы: ★ закреплена + дата, сама фраза, её слова (тап —
// окно слова, как на главном экране) и «Открыть фразу». Если урок фразы пропал
// (p.lost) — вместо кнопки заботливое объяснение: фраза и слова остаются в
// памяти, повторять ничего не нужно. Слова фразы берутся из снимка закрепления
// и показываются с их силой, пока слово есть в памяти
export default function MemoryPhraseCard({ p, today, onWord, onOpenModule, onClose }) {
  const date = phraseDateLabel(p.date, today)
  return (
    <div className="lrSheetBack" onClick={onClose}>
      <div className="lrSheet" role="dialog" aria-label={`Фраза ${p.title}`} onClick={e => e.stopPropagation()}>
        <p className="memPhraseCardMeta"><Star aria-hidden="true" /> закреплена{date && ` · ${date}`}</p>
        <p className="lrSheetWord">{p.title || 'Фраза'}</p>
        {p.words.length > 0 && (
          <>
            <p className="memPhraseCardLabel">Слова фразы</p>
            <div className="memWords">
              {p.words.map(w => (
                <MemoryWordChip key={w.word} w={{ ...w, hasDeck: w.hasDeck && w.step != null }} onClick={() => onWord({ ...w, phrase: p.title })} />
              ))}
            </div>
          </>
        )}
        {p.lost
          ? <p className="memPhraseLost" role="status">{PHRASE_LOST_TEXT[p.lost]}</p>
          : <button className="lrBtn lrBtnMain" onClick={onOpenModule}>Открыть фразу</button>}
        <button className="lrBtn lrBtnGhost" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}
