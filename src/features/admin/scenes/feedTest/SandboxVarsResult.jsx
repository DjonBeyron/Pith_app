import LevelDot from '../LevelDot.jsx'
import { levelName } from '../../../../shared/lib/memory/memoryLevels.js'

// Таблица результата «Прогнать как пользователь»: слово сцены → выбранное слово (уровень, цвет) → итоговая реплика.
// Пояснение под словом (row.note) честно говорит, откуда оно взято — в том числе «нет слова нужного уровня — показано запасное».
export default function SandboxVarsResult({ rows }) {
  if (!rows?.length) return null
  return (
    <table className="scbSbTable" aria-label="Подстановка слов пользователя">
      <thead><tr><th>Слово сцены</th><th>Выбрано</th><th>Итоговая реплика</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name} className={r.source === 'fallback' ? 'isFallback' : ''}>
            <td><code>{`{${r.name}}`}</code></td>
            <td>
              <b>{r.level != null && <LevelDot level={r.level} />}{r.word.text}</b>
              {r.word.translation ? ` — ${r.word.translation}` : ''}
              {r.level != null && <span className="scbSub"> уровень {r.level}, {levelName(r.level).toLowerCase()}</span>}
              <span className="scbSub scbSbNote">{r.note}</span>
            </td>
            <td>{r.line ? <>{r.line}{r.lineRu && <span className="scbSub scbSbNote">{r.lineRu}</span>}</> : <span className="scbSub">слово не используется в репликах</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
