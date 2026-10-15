import { TASK_LIMITS } from '../../scene/v2/sceneTask.js'
import { TASK_KIND_LABEL, taskKind, taskPreview, isVoiceKind } from './taskModel.js'
import TaskAnswerTester from './TaskAnswerTester.jsx'
import TaskStringList from './TaskStringList.jsx'
import TaskVoiceFields from './TaskVoiceFields.jsx'
import TaskFeedTestRow from './TaskFeedTestRow.jsx'
import ScTip from './ScTip.jsx'
import Panel from './ui/Panel.jsx'

// Панель «Задание после сцены» (ui/Panel, ключ task) в настройках сборщика: переключатель видов в шапке
// «Нет | Перевод | Ответь коту | Повтори за диктором», общие поля (реплика, вопрос, подсказка), поля вида
// (перевод — варианты accept; say/repeat — TaskVoiceFields), тестер (TaskAnswerTester) и строка «Тест в ленте» (TaskFeedTestRow).
// id f-task-* — подсветка замечаний линтера (lintFieldMap).
const INTRO = 'Без задания сцена в ленте просто идёт по кругу. «Перевод» — зритель после первого проигрывания пишет по-русски, что сказал персонаж. «Ответь коту» — отвечает вслух на реплику-вопрос. «Повтори за диктором» — повторяет реплику вслух.'
const PROMPT_LABEL = { translate: 'Вопрос зрителю', say: 'Подпись на панели', repeat: 'Подпись на панели' }

export default function SceneTaskSection({ scene, actions, savedId = null, setStatus, onFeedTest = null }) {
  const kind = taskKind(scene)
  const task = scene.task
  const preview = taskPreview(scene)
  const voice = isVoiceKind(kind)
  const names = { a: scene.characters.a.name, b: scene.characters.b.name }

  return (
    <Panel
      id="task" title="Задание после сцены" tip="task" fieldId="f-task"
      extra={(
        <div className="scSegBtns" role="radiogroup" aria-label="Вид задания">
          <button type="button" role="radio" aria-checked={!kind} className={!kind ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.setTaskKind(null)}>Нет</button>
          {Object.entries(TASK_KIND_LABEL).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.setTaskKind(k)}>{label}</button>
          ))}
          <ScTip help="task_kind" />
        </div>
      )}
    >
      {!task ? (
        <p className="scbSub">{INTRO}</p>
      ) : (
        <>
          <label className="scbField">
            <span className="scbFieldLabel">{kind === 'say' ? 'Реплика-вопрос' : 'Какая реплика спрашивается'} <ScTip help="task_line" /></span>
            <select id="f-task-lineIndex" className="fsNote" value={task.lineIndex ?? ''} onChange={e => actions.updateTask({ lineIndex: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">автоматически{voice ? '' : ' — последняя с переводом'}{preview ? ` (сейчас №${preview.index + 1})` : ''}</option>
              {scene.timeline.map((l, i) => (
                <option key={i} value={i}>{i + 1}. {names[l.who]}: {String(l.text).slice(0, 40)}{l.text.length > 40 ? '…' : ''}{l.translation || voice ? '' : ' — без перевода'}</option>
              ))}
            </select>
          </label>
          {!voice && preview && !preview.line.translation && (
            <p className="scbSlotReason" role="status">У реплики №{preview.index + 1} нет перевода — впишите его в таймлайне или добавьте варианты ответа ниже.</p>
          )}
          <label className="scbField">
            <span className="scbFieldLabel">{PROMPT_LABEL[kind]} <span className="scbCounter">{(task.prompt ?? '').length} / {TASK_LIMITS.maxPrompt}</span></span>
            <input id="f-task-prompt" className="fsNote" value={task.prompt ?? ''} maxLength={TASK_LIMITS.maxPrompt} onChange={e => actions.updateTask({ prompt: e.target.value })} placeholder={preview?.prompt ?? 'Что сказал(а) …?'} />
          </label>
          {voice
            ? <TaskVoiceFields task={task} preview={preview} actions={actions} />
            : (
              <TaskStringList
                field="accept" label="Допустимые варианты ответа" tip="task_accept" items={task.accept} actions={actions}
                note={preview?.line.translation ? `Эталон — перевод реплики: «${preview.line.translation}». Ниже — синонимы и другие формулировки.` : null}
              />
            )}
          <label className="scbField">
            <span className="scbFieldLabel">Подсказка после первой ошибки <span className="scbCounter">{(task.hint ?? '').length} / {TASK_LIMITS.maxHint}</span></span>
            <input id="f-task-hint" className="fsNote" value={task.hint ?? ''} maxLength={TASK_LIMITS.maxHint} onChange={e => actions.updateTask({ hint: e.target.value })} placeholder="о чём реплика в двух словах, без самого ответа" />
          </label>
          <TaskAnswerTester scene={scene} />
          <TaskFeedTestRow savedId={savedId} setStatus={setStatus} onFeedTest={onFeedTest} />
        </>
      )}
    </Panel>
  )
}
