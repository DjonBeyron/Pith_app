import { plural } from '../../shared/lib/plural.js'

// Строка начатой фразы («Мои начатые фразы», MemoryPhrases): название, «Пройдено N из M · осталось K»
// и тонкая полоска прогресса модуля; слева — процент. Тап открывает схему модуля — продолжить с места,
// где остановился. idx — порядковый номер строки: мелкий, в левом верхнем углу, как номер урока на карточке
// в схеме модуля (.mgLessonIdx в lessons-chain.css)
export default function MemoryStartedRow({ p, idx = null, onClick }) {
  const left = p.total - p.done
  return (
    <button className="memPhraseRow memStartedRow" onClick={() => onClick(p)}>
      {idx != null && <span className="memStartedIdx" aria-label={`Номер ${idx}`}>{idx}</span>}
      <span className="memStartedPct" aria-label={`Пройдено ${p.pct}%`}>{p.pct}%</span>
      <span className="memPhraseText">
        <b>{p.title || 'Фраза'}</b>
        <small>Пройдено {p.done} из {p.total} {plural(p.total, 'урока', 'уроков', 'уроков')} · осталось {left}</small>
        <span className="memStartedTrack" aria-hidden="true"><span style={{ width: `${p.pct}%` }} /></span>
      </span>
    </button>
  )
}
