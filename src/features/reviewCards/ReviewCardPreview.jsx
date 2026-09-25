import { useState, useEffect } from 'react'
import LessonPlayer from '../player/LessonPlayer.jsx'

const VERDICT = {
  correct: { kind: 'ok', text: 'Верно! Так карточка засчитается ученику' },
  wrong: { kind: 'bad', text: 'Была ошибка — в повторении карточка вернётся в конце сессии' },
}

// Предпросмотр карточки глазами ученика: тот же LessonPlayer в рамке
// .reviewCardFrame, что в повторении (review/ReviewTurn.jsx), без записи
// статистики. Играет ноды как есть сейчас — и несохранённые правки, и файлы
// урока, ещё не залитые в R2. «Заново» перемонтирует плеер (key),
// Esc / «К правке» — назад в редактор
export default function ReviewCardPreview({ index, nodes, files, onClose }) {
  const [run, setRun] = useState(0)
  const [result, setResult] = useState(null) // 'correct' | 'wrong'
  const verdict = result && VERDICT[result]

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function restart() {
    setResult(null)
    setRun(r => r + 1)
  }

  return (
    <div className="reviewScreen rcPreview" role="dialog" aria-label="Предпросмотр карточки">
      <div className="rcPreviewHead">
        <span className="rcPreviewTitle">Предпросмотр · карточка {index + 1}</span>
        <button className="reviewClose" onClick={onClose} aria-label="Закрыть предпросмотр">✕</button>
      </div>
      <div className="reviewCard">
        <div className="reviewCardFrame">
          <LessonPlayer
            key={run}
            nodes={nodes}
            files={files}
            recordStats={false}
            onFinishStats={({ wrong }) => setResult(wrong > 0 ? 'wrong' : 'correct')}
            onSummaryClose={() => {}}
            onClose={onClose}
          />
        </div>
        {verdict && (
          <div className={`reviewVerdict reviewVerdict--${verdict.kind}`} role="status">{verdict.text}</div>
        )}
      </div>
      <div className="reviewActions">
        <button className="reviewBtn" onClick={restart}>Заново</button>
        <button className="reviewBtn reviewBtn--main" onClick={onClose}>К правке</button>
      </div>
    </div>
  )
}
