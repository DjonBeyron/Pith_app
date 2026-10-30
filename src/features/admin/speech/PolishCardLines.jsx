import PolishListen from './PolishListen.jsx'
import { actLineRows, actVoiceCount } from '../../rehearsal/polish/polishLines.js'

// Реплики Пита на одной карточке этапа («Шлифовка репетиции»): «озвучено 2/3» и список — у озвученной кнопка «Послушать», у остальных причина (нет озвучки / {word} не озвучивается).
// lines — реплики из настроек приложения (normalizeLines) или null, пока не загрузились.
export default function PolishCardLines({ act, lines }) {
  const rows = actLineRows(act, lines)
  if (!rows.length) return null
  const c = actVoiceCount(act, lines)
  return (
    <div className="rhpLines" data-testid={`rh-polish-lines-${act}`}>
      <div className="aspHint" data-testid={`rh-polish-lines-count-${act}`}>
        {lines ? `Реплики Пита: озвучено ${c.done}/${c.total}${c.templates ? ` (+ ${c.templates} со словом, не озвучивается)` : ''}` : 'Реплики Пита: загружаю…'}
      </div>
      {lines && (
        <ul className="rhpLineList">
          {rows.map(r => (
            <li key={r.id} className="rhpLine" data-state={r.state} data-testid={`rh-polish-line-${r.id}`}>
              <span className="rhpLineText"><code>{r.id}</code> «{r.text}»{r.why && <span className={r.state === 'missing' ? 'aspBad' : 'aspHint'}> — {r.why}</span>}</span>
              {r.url && <PolishListen url={r.url} testid={`rh-polish-listen-${r.id}`} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
