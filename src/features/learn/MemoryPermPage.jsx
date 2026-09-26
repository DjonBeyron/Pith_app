import { plural } from '../../shared/lib/plural.js'
import MemoryWordChip from './MemoryWordChip.jsx'

// Постоянная память — своя фиолетовая страница (по пятиугольнику): слова,
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
        <b>Постоянная память</b>
        <div className="memPermCount">
          <strong>{n}</strong>
          <span>{plural(n, 'слово выучено', 'слова выучены', 'слов выучены')} навсегда</span>
        </div>
        <p>
          {n
            ? 'Эти слова прошли все три ступени: новенькие → мои → родные. Теперь они твои навсегда — иногда будем встречать их в новых уроках.'
            : 'Сюда уходят родные слова, которые ты вспомнил на месячной проверке. Пройди с ними все три ступени: новенькие → мои → родные.'}
        </p>
      </div>
      <div className="memList">
        {words.map(w => <MemoryWordChip key={w.word} w={w} perm row onClick={onWord} />)}
      </div>
    </div>
  )
}
