// Тонкая полоска прогресса сессии под карточкой: одна капсула на карточку очереди,
// возврат ошибки добавляет капсулу. Стоит внизу, под панелью действий (.reviewFoot), а не в
// шапке: фраза наверху остаётся на месте, а полоска не спорит с подсказкой «смахни карточку
// влево» — у неё своё место под ней
export default function ReviewProgress({ session }) {
  const { queue, index, events } = session
  const capsule = i => {
    if (i === index) return 'reviewCapsule reviewCapsule--now'
    if (i > index) return 'reviewCapsule'
    return events[i]?.result === 'wrong' ? 'reviewCapsule reviewCapsule--bad' : 'reviewCapsule reviewCapsule--ok'
  }
  return (
    <div className="reviewCapsules" aria-label={`Карточка ${Math.min(index + 1, queue.length)} из ${queue.length}`}>
      {queue.map((q, i) => <span key={q.key} className={capsule(i)} />)}
    </div>
  )
}
