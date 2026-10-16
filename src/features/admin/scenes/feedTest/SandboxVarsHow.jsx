import { VARS_HOW, VARS_EXAMPLES, exampleLine } from '../varsHowTexts.js'

// Свёрнутая подсказка «Как это работает» в панели песочницы: те же короткие абзацы, что в «?» блока «Слова пользователя»
// (varsHowTexts.js), плюс примеры «до → после» на репликах шаблона «Шаблон: закажи еду»
export default function SandboxVarsHow() {
  return (
    <details className="scbSbHow">
      <summary>Как это работает</summary>
      {VARS_HOW.map(s => <p key={s.key} className="scbSub"><b>{s.title}.</b> {s.text}</p>)}
      <p className="scbSub"><b>Примеры (слово cheese / сыр).</b></p>
      <ul className="scbSbExamples">{VARS_EXAMPLES.map((e, i) => <li key={i}><code>{exampleLine(e)}</code></li>)}</ul>
    </details>
  )
}
