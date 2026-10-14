import { useState } from 'react'
import { taskPreview, verdictText } from './taskModel.js'
import ScTip from './ScTip.jsx'

// Тестер ответа в секции «Задание после сцены»: админ печатает ответ как зритель и сразу видит, засчитает ли его проверка
// (checkTaskAnswer из sceneTask.js): ✓/✗, доля совпавших ключевых слов, чего не хватило, с каким эталоном совпало.
export default function TaskAnswerTester({ scene }) {
  const [input, setInput] = useState('')
  const preview = taskPreview(scene, input)
  if (!preview) return null
  const { result, answers } = preview
  const cls = !result ? 'scbTestOut' : result.ok ? 'scbTestOut scOk' : 'scbTestOut scBad'
  return (
    <div className="scbTester" id="f-task-tester">
      <label className="scbField">
        <span className="scbFieldLabel">Проверь, как засчитается ответ <ScTip help="task_tester" /></span>
        <input className="fsNote" value={input} onChange={e => setInput(e.target.value)} placeholder="напишите ответ зрителя — результат появится сразу" aria-label="Пробный ответ зрителя" />
      </label>
      <p className={cls} role="status" aria-live="polite">
        {!answers.length
          ? 'Эталонов нет: добавьте перевод реплики или варианты ответа'
          : result
            ? <>{verdictText(result)}{result.matchedAnswer && <span className="scbSub"> · ближе всего к «{result.matchedAnswer}»</span>}</>
            : `Эталонов: ${answers.length}. Регистр, ё/е, знаки и опечатки не важны; служебные слова не считаются.`}
      </p>
    </div>
  )
}
