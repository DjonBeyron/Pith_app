import { DEV_TITLE, DEV_INTRO, DEV_FILES, DEV_STEPS, DEV_DONTS, DEV_CHECKLIST, DEV_COMMANDS } from './designerDevTexts.js'
import ScTip from '../ScTip.jsx'

// Раздел «Для программиста / админа» (в админке и в печатном документе — print=true убирает
// кнопки «?» и инструмент, остаётся текст). Порядок: вводная → шаги → где лежит → команды →
// чего не делать → чек-лист приёмки. Конвертер SVG → код живёт отдельно (SvgToCodeTool).
export default function DesignerDevSection({ print = false, children = null }) {
  return (
    <section className="scdSec scdDev" id="scd-dev" aria-labelledby="scd-dev-h">
      <h2 id="scd-dev-h" className="scdH">9. {DEV_TITLE} {!print && <ScTip help="dev_section" />}</h2>
      <p className="scHint">{DEV_INTRO}</p>
      <ol className="scdDevSteps">
        {DEV_STEPS.map(s => <li key={s.id}><b>{s.title}.</b> {s.body}</li>)}
      </ol>
      {children}
      <h3 className="scdDevH">Где это лежит</h3>
      <table className="scdDevFiles">
        <tbody>
          {DEV_FILES.map(([path, what]) => <tr key={path}><td><code>{path}</code></td><td>{what}</td></tr>)}
        </tbody>
      </table>
      <h3 className="scdDevH">Команды проверки (по порядку)</h3>
      <p className="scdChips">{DEV_COMMANDS.map(c => <code key={c}>{c}</code>)}</p>
      <h3 className="scdDevH">Чего не делать</h3>
      <ul className="scList">{DEV_DONTS.map(d => <li key={d}>{d}</li>)}</ul>
      <h3 className="scdDevH">Чек-лист приёмки спрайта от дизайнера</h3>
      <ul className="scdCheckList">{DEV_CHECKLIST.map(c => <li key={c}>☐ {c}</li>)}</ul>
    </section>
  )
}
