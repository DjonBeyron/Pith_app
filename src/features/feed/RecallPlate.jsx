import { Check } from 'lucide-react'
import ReviewWordBar from '../review/ReviewWordBar.jsx'
import { recallGrowth } from './feedRecall.js'

// Содержимое плашки перевода, когда по слову к повтору тапнули (макет frazy-pomnish.html):
//   quiz — подпись «Закрепить знание» и три варианта перевода;
//   ok / hard / bad — результат: галочка (серая, если верно, но долго; нет — если ошибся), перевод,
//   пометка справа и тот же чип слова, что во вкладке «Память» и в итоге повторения.
// Полоска слова стоит на прежнем месте, пока сервер не ответил (go), потом растёт к новому значению.
// translation — верный перевод слова; r — состояние повторения из pick.recall (useSlideRecall)
export default function RecallPlate({ r, translation, onAnswer }) {
  if (r.phase === 'quiz') {
    return (
      <>
        <span className="rcCap">Закрепить знание</span>
        <span className="rcOpts">
          {r.options.map(o => (
            <button key={o} type="button" className="rcOpt" onClick={e => { e.stopPropagation(); onAnswer(o) }}>{o}</button>
          ))}
        </span>
      </>
    )
  }
  const bad = r.phase === 'bad'
  const growth = recallGrowth(r)
  return (
    <>
      <div className="rcRow">
        {!bad && <span className={r.phase === 'hard' ? 'rcCheck rcCheckSoft' : 'rcCheck'}><Check strokeWidth={3.4} /></span>}
        <b>{translation}</b>
        {r.phase === 'hard' && <span className="rcNote">Верно, но долго<br />повторим позже</span>}
        {bad && <span className="rcNote rcNoteBad">вернёмся<br />завтра</span>}
        {growth && <span className="rcNote rcNoteUp">{growth[0]}<br />{growth[1]}</span>}
      </div>
      <ReviewWordBar word={r.key} from={r.from ?? r.step} to={r.to ?? null} settled={!!r.perm} delay={250} go={!!r.go} />
    </>
  )
}
