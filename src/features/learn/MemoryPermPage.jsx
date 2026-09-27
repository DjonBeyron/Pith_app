import { plural } from '../../shared/lib/plural.js'
import MemoryWordChip from './MemoryWordChip.jsx'
import { SETTLED_NAME } from './memoryLadder.js'

// «Закреплённые слова» — своя фиолетовая страница (по пятиугольнику): слова,
// прошедшие все три ступени. Пусто — объясняем, как слово сюда попадает
export default function MemoryPermPage({ words, onWord, onBack }) {
  const n = words.length
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
        <p>
          {n
            ? 'Слова прочно закрепились в памяти и легко вспоминаются: прошли все ступени — новые → знакомые → усвоенные. Изредка будем проверять, что они на месте.'
            : 'Сюда попадают усвоенные слова, которые ты вспомнил на месячной проверке. Пройди с ними все ступени: новые → знакомые → усвоенные.'}
        </p>
      </div>
      <div className="memList">
        {words.map(w => <MemoryWordChip key={w.word} w={w} perm row onClick={onWord} />)}
      </div>
    </div>
  )
}
