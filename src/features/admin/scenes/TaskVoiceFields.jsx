import { RATIO_MIN, RATIO_MAX, taskRatio } from './taskModelVoice.js'
import TaskStringList from './TaskStringList.jsx'
import TaskKeywords from './TaskKeywords.jsx'
import ScTip from './ScTip.jsx'

// Поля голосовых заданий (kind say | repeat) в SceneTaskSection:
//  · repeat — эталон (text целевой реплики, только показ) + допустимые варианты accept;
//  · say — ожидаемые ответы answers, ключевые слова keywords, accept;
//  · оба — порог passRatio (слайдер 0.5..1; 0.7 — как в уроке) и «Строго» (strict).
export default function TaskVoiceFields({ task, preview, actions }) {
  const say = task.kind === 'say'
  const ratio = taskRatio(task)
  return (
    <>
      {!say && (
        <div className="scbField" id="f-task-reference">
          <span className="scbFieldLabel">Эталон — что повторяет ученик</span>
          <p className="scbRef">{preview?.line?.text ? `«${preview.line.text}»` : 'У целевой реплики нет текста'}</p>
          <p className="scbSub">Эталон — текст реплики из таймлайна. Если ученик произнесёт её иначе, но верно по смыслу, добавьте вариант ниже.</p>
        </div>
      )}
      {say && (
        <>
          <TaskStringList
            field="answers" label="Ожидаемые ответы" tip="task_answers" items={task.answers ?? []} actions={actions} itemLabel="Ответ"
            note="Целевая реплика — вопрос. Здесь — как ученик может ответить своими словами, хотя бы один ответ."
            placeholder="например: I want a coffee, Enter — добавить"
          />
          <TaskKeywords items={task.keywords ?? []} actions={actions} />
        </>
      )}
      <TaskStringList
        field="accept" label={say ? 'Другие допустимые формулировки' : 'Допустимые варианты произношения'} tip="task_accept" items={task.accept ?? []} actions={actions}
      />
      <div className="scbField" id="f-task-passRatio">
        <span className="scbFieldLabel">Порог засчитывания <ScTip help="task_pass_ratio" /> <span className="scbCounter">{Math.round(ratio * 100)}%</span></span>
        <div className="scbAcceptRow">
          <input type="range" className="scbRange" min={RATIO_MIN} max={RATIO_MAX} step="0.05" value={ratio} onChange={e => actions.updateTask({ passRatio: Number(e.target.value) })} aria-label="Порог засчитывания" />
          <button type="button" className="fsBtn fsBtnSmall" onClick={() => actions.updateTask({ passRatio: null })} disabled={task.passRatio == null}>Сбросить</button>
        </div>
        <p className="scbSub">0.7 — как в уроке «Сказать фразу». Выше — строже, ниже — прощает больше.</p>
      </div>
      <label className="scbCheck" id="f-task-strict">
        <input type="checkbox" checked={!!task.strict} onChange={e => actions.updateTask({ strict: e.target.checked || null })} />
        <span>Строго <ScTip help="task_strict" /></span>
      </label>
    </>
  )
}
