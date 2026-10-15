import { taskTargetLine, taskAnswers, keyTokens, normalizeTask, VOICE_KINDS } from './sceneTask.js'
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'

// Лёгкая проверка задания сцены (sceneTask.js / sceneTaskVoice.js): ответ проверять нечем — ошибка; остальное — советы
const MIN_TASK_LINES = 3
const REPEAT_MAX_WORDS = 12
const PASS_GOOD = [0.6, 0.85]

function lintVoice(scene, task, target, out) {
  const t = normalizeTask(task) ?? {}
  const hasKeys = (t.keywords ?? []).length > 0
  if (task.kind === 'repeat') {
    if (!String(target.line?.text ?? '').trim()) { out.push({ level: 'error', text: `task — у реплики №${target.index + 1} нет текста: повторять нечего` }); return }
    const n = tokenize(target.line.text).length
    if (n > REPEAT_MAX_WORDS) out.push({ level: 'warn', text: `task — реплика №${target.index + 1} длиннее ${REPEAT_MAX_WORDS} слов (${n}): повторить вслух трудно, выберите короче` })
  } else if (!taskAnswers(task, target.line).length && !hasKeys) {
    out.push({ level: 'error', text: 'task.answers — для «Ответь коту» нужен хотя бы один ожидаемый ответ (answers) или ключевые слова (keywords)' })
  } else if (!task.hint) out.push({ level: 'warn', text: 'task.hint — у «Ответь коту» нет подсказки: ученик может не понять, что отвечать' })
  if (t.passRatio !== undefined && (t.passRatio < PASS_GOOD[0] || t.passRatio > PASS_GOOD[1])) out.push({ level: 'warn', text: `task.passRatio — ${t.passRatio} вне рекомендуемых ${PASS_GOOD[0]}..${PASS_GOOD[1]}` })
  if (task.lineIndex === null || task.lineIndex === undefined) out.push({ level: 'warn', text: `task.lineIndex — реплика не выбрана, берётся №${target.index + 1}` })
}

export function lintTask(scene, out) {
  if (scene.task === undefined || scene.task === null) return
  const target = taskTargetLine(scene)
  if (!target) return
  if (VOICE_KINDS.includes(scene.task.kind)) { lintVoice(scene, scene.task, target, out); return }
  const answers = taskAnswers(scene.task, target.line)
  if (!answers.length) { out.push({ level: 'error', text: `task — у реплики №${target.index + 1} нет перевода (translation) и нет accept: ответ проверить нечем` }); return }
  const tl = Array.isArray(scene.timeline) ? scene.timeline : []
  if (tl.length < MIN_TASK_LINES) out.push({ level: 'warn', text: `task — диалог короче ${MIN_TASK_LINES} реплик: задание «о чём говорили» почти не о чём` })
  if (keyTokens(answers[0]).length < 2) out.push({ level: 'warn', text: `task — эталон «${answers[0]}» из одного значимого слова: ответ засчитается слишком легко` })
  if (answers.length === 1) out.push({ level: 'warn', text: 'task.accept — нет синонимичных переводов: засчитается только дословный ответ' })
  if (scene.task.lineIndex === null || scene.task.lineIndex === undefined) out.push({ level: 'warn', text: `task.lineIndex — реплика не выбрана, спрашивается №${target.index + 1} (последняя с переводом)` })
}
