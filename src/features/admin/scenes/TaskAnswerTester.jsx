import { useState } from 'react'
import { taskPreview, verdictText } from './taskModel.js'
import { speechVerdictText, nearestReference } from './taskModelVoice.js'
import ScTip from './ScTip.jsx'

// Тестер ответа в секции «Задание после сцены». Перевод: админ печатает ответ как зритель (checkTaskAnswer).
// say/repeat: поле «Что ученик сказал (как распознал бы микрофон)» → checkSpeechAnswer. В обоих случаях: ✓/✗, доля совпадения,
// чего не хватило, с каким эталоном совпало.
export default function TaskAnswerTester({ scene }) {
  const [input, setInput] = useState('')
  const preview = taskPreview(scene, input)
  if (!preview) return null
  const { result, answers, voice } = preview
  const cls = !result ? 'scbTestOut' : result.ok ? 'scbTestOut scOk' : 'scbTestOut scBad'
  const near = nearestReference(result)
  return (
    <div className="scbTester" id="f-task-tester">
      <label className="scbField">
        <span className="scbFieldLabel">{voice ? 'Что ученик сказал (как распознал бы микрофон)' : 'Проверь, как засчитается ответ'} {voice ? <ScTip help="task_tester_voice" /> : <ScTip help="task_tester" />}</span>
        <input
          className="fsNote" value={input} onChange={e => setInput(e.target.value)}
          placeholder={voice ? 'впишите распознанную речь — результат появится сразу' : 'напишите ответ зрителя — результат появится сразу'}
          aria-label={voice ? 'Пробная речь ученика' : 'Пробный ответ зрителя'}
        />
      </label>
      <p className={cls} role="status" aria-live="polite">
        {!answers.length
          ? 'Эталонов нет: добавьте перевод реплики или варианты ответа'
          : result
            ? <>{voice ? speechVerdictText(result, preview.ratio) : verdictText(result)}{(near ?? result.matchedAnswer) && <span className="scbSub"> · ближе всего к «{near ?? result.matchedAnswer}»</span>}</>
            : `Эталонов: ${answers.length}. Регистр, ё/е, знаки и опечатки не важны; служебные слова не считаются.`}
      </p>
    </div>
  )
}
