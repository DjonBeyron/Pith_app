import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { TASK_LIMITS } from '../../scene/v2/sceneTask.js'
import { setForcedSceneTask } from '../../feed/scene/sceneTaskLimits.js'
import { TASK_KIND_LABEL, taskKind, taskPreview } from './taskModel.js'
import TaskAnswerTester from './TaskAnswerTester.jsx'
import ScTip from './ScTip.jsx'
import Panel from './ui/Panel.jsx'

// Панель «Задание после сцены» (ui/Panel, ключ task) в настройках сборщика: переключатель в шапке «Нет | Перевод», реплика из таймлайна, текст вопроса,
// допустимые варианты ответа (≤ TASK_LIMITS.maxAccept), подсказка, тестер ответа (TaskAnswerTester) и «Показать в ленте»
// (принудительный показ для теста, обходит лимиты один раз — sceneTaskLimits). id f-task-* — подсветка замечаний линтера.
export default function SceneTaskSection({ scene, actions, savedId = null, setStatus }) {
  const [draftAccept, setDraftAccept] = useState('')
  const kind = taskKind(scene)
  const task = scene.task
  const preview = taskPreview(scene)
  const names = { a: scene.characters.a.name, b: scene.characters.b.name }
  const addAccept = () => { actions.addAccept(draftAccept); setDraftAccept('') }
  const force = () => {
    const ok = setForcedSceneTask(savedId)
    setStatus?.(ok
      ? { kind: 'ok', text: 'Задание покажется в ленте на этой сцене после первого проигрывания (один раз, без лимитов)' }
      : { kind: 'error', text: 'Не удалось записать (sessionStorage недоступен)' })
  }

  return (
    <Panel
      id="task" title="Задание после сцены" tip="task" fieldId="f-task"
      extra={(
        <div className="scSegBtns" role="radiogroup" aria-label="Вид задания">
          <button type="button" role="radio" aria-checked={!kind} className={!kind ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.setTaskKind(null)}>Нет</button>
          {Object.entries(TASK_KIND_LABEL).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.setTaskKind(k)}>{label}</button>
          ))}
        </div>
      )}
    >
      {!task ? (
        <p className="scbSub">Без задания сцена в ленте просто идёт по кругу. «Перевод» — после первого проигрывания зритель напишет по-русски, что сказал персонаж.</p>
      ) : (
        <>
          <label className="scbField">
            <span className="scbFieldLabel">Какая реплика спрашивается <ScTip help="task_line" /></span>
            <select id="f-task-lineIndex" className="fsNote" value={task.lineIndex ?? ''} onChange={e => actions.updateTask({ lineIndex: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">автоматически — последняя с переводом{preview ? ` (сейчас №${preview.index + 1})` : ''}</option>
              {scene.timeline.map((l, i) => (
                <option key={i} value={i}>{i + 1}. {names[l.who]}: {String(l.text).slice(0, 40)}{l.text.length > 40 ? '…' : ''}{l.translation ? '' : ' — без перевода'}</option>
              ))}
            </select>
          </label>
          {preview && !preview.line.translation && (
            <p className="scbSlotReason" role="status">У реплики №{preview.index + 1} нет перевода — впишите его в таймлайне или добавьте варианты ответа ниже.</p>
          )}
          <label className="scbField">
            <span className="scbFieldLabel">Вопрос зрителю <span className="scbCounter">{(task.prompt ?? '').length} / {TASK_LIMITS.maxPrompt}</span></span>
            <input id="f-task-prompt" className="fsNote" value={task.prompt ?? ''} maxLength={TASK_LIMITS.maxPrompt} onChange={e => actions.updateTask({ prompt: e.target.value })} placeholder={preview?.prompt ?? 'Что сказал(а) …?'} />
          </label>
          <div className="scbField" id="f-task-accept">
            <span className="scbFieldLabel">Допустимые варианты ответа <ScTip help="task_accept" /> <span className="scbCounter">{task.accept.length} / {TASK_LIMITS.maxAccept}</span></span>
            {preview?.line.translation && <p className="scbSub">Эталон — перевод реплики: «{preview.line.translation}». Ниже — синонимы и другие формулировки.</p>}
            <ol className="scbAccepts">
              {task.accept.map((a, i) => (
                <li key={i} className="scbAcceptRow" id={`f-task-accept-${i}`}>
                  <input className="fsNote" value={a} maxLength={TASK_LIMITS.maxAcceptLen} onChange={e => actions.updateAccept(i, e.target.value)} aria-label={`Вариант ${i + 1}`} />
                  <button type="button" className="scbIcon scbIconDanger" onClick={() => actions.removeAccept(i)} aria-label={`Удалить вариант ${i + 1}`}><Trash2 size={14} /></button>
                </li>
              ))}
            </ol>
            <div className="scbAcceptRow">
              <input className="fsNote" value={draftAccept} maxLength={TASK_LIMITS.maxAcceptLen} onChange={e => setDraftAccept(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAccept() } }} placeholder="новый вариант, Enter — добавить" aria-label="Новый вариант ответа" disabled={task.accept.length >= TASK_LIMITS.maxAccept} />
              <button type="button" className="fsBtn fsBtnSmall" onClick={addAccept} disabled={!draftAccept.trim() || task.accept.length >= TASK_LIMITS.maxAccept}>Добавить</button>
            </div>
          </div>
          <label className="scbField">
            <span className="scbFieldLabel">Подсказка после первой ошибки <span className="scbCounter">{(task.hint ?? '').length} / {TASK_LIMITS.maxHint}</span></span>
            <input id="f-task-hint" className="fsNote" value={task.hint ?? ''} maxLength={TASK_LIMITS.maxHint} onChange={e => actions.updateTask({ hint: e.target.value })} placeholder="о чём реплика в двух словах, без самого ответа" />
          </label>
          <TaskAnswerTester scene={scene} />
          <div className="scbHRow">
            <span className="scbSub">Тест в ленте: сцена должна быть сохранена и привязана к модулю ленты.</span>
            <button type="button" className="fsBtn fsBtnSmall" onClick={force} disabled={!savedId} title={savedId ? 'Следующий показ этой сцены в ленте — с заданием, без лимитов' : 'Сначала сохраните сцену в библиотеку'}>Показать в ленте</button>
          </div>
        </>
      )}
    </Panel>
  )
}
