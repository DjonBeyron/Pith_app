import { plural } from '../../shared/lib/plural.js'
import MemoryWordChip from './MemoryWordChip.jsx'
import { SETTLED_NAME, SETTLED_ABOUT, SETTLED_ABOUT_EMPTY } from './memoryLadder.js'
import { useWordVoice } from './useWordVoice.js'

// «Закреплённые слова» — своя фиолетовая страница (по пятиугольнику): слова,
// прошедшие все три ступени. Пусто — объясняем, как слово сюда попадает
export default function MemoryPermPage({ words, onWord, onBack }) {
  const n = words.length
  const voice = useWordVoice()
  return (
    <div className="memPage">
      <div className="memPageTop">
        <button className="memBack" onClick={onBack}>← Назад</button>
        <h1 className="lrTitle">Моя память</h1>
      </div>
      <div className="memHead memHead--Perm">
        <b>{SETTLED_NAME}</b>
        <div className="memPermCount">
          <strong>{n}</strong>
          <span>{plural(n, 'слово закреплено', 'слова закреплены', 'слов закреплено')}</span>
        </div>
        <p>{n ? SETTLED_ABOUT : SETTLED_ABOUT_EMPTY}</p>
      </div>
      <div className="memList">
        {words.map(w => (
          <MemoryWordChip key={w.word} w={w} perm row onClick={onWord} onPlay={voice.play} canPlay={voice.has(w.word)} />
        ))}
      </div>
    </div>
  )
}
