import { taskTargetLine, taskAnswers, taskPrompt, normalizeTask } from '../../scene/v2/sceneTask.js'
import { taskNeedsMic } from './sceneVoiceData.js'

// Чистая часть проводки задания «О чём диалог» в слайд-сцену (useSceneTask.js связывает с React).

// Задание сцены для ленты: { task, index, line, answers, prompt, voice } | null, если задания нет или ответ проверять нечем.
// voice — голосовой вид ('say' / 'repeat': панель с микрофоном); у «Ответь коту» без готовых ответов хватает ключевых слов
export function feedTaskOf(scene) {
  const task = normalizeTask(scene?.task)
  const target = task ? taskTargetLine(scene) : null
  if (!task || !target) return null
  const answers = taskAnswers(task, target.line)
  const voice = taskNeedsMic(task)
  if (!answers.length && !(voice && task.keywords?.length)) return null
  return { task, index: target.index, line: target.line, answers, prompt: taskPrompt(task, scene, target.line), voice }
}

// Какая панель выезжает для задания: 'voice' — микрофон (SceneVoicePanel), 'keyboard' — клавиатура (SceneTaskSheet)
export const taskPanelKind = info => (info?.voice ? 'voice' : 'keyboard')

// Остановить озвучку сцены (реплика «Ещё раз» не должна попасть в микрофон) и оставить режиссёра на последней реплике: pause() гасит
// ручной возврат, поэтому play(last) под заморозкой снова «запоминает желание» — после закрытия панели круг продолжится сам
export function silenceScene(api, total) {
  if (!api) return
  api.pause?.()
  if (total > 0) api.play?.(total - 1)
}

// Детектор ПЕРВОГО полного проигрывания по состояниям режиссёра ({ status, index, total }), которые приходят только на
// границах реплик. Сцена в ленте зациклена: 'ended' не наступает, а полный круг виден как «играла последняя реплика →
// снова играет нулевая». Без loop — 'ended'. → { sawLast, done }; done ставится один раз
export const initialPlay = () => ({ sawLast: false, done: false })

export function trackPlay(p, { status, index, total }) {
  if (p.done || !total) return p
  if (status === 'ended') return { ...p, done: true }
  if (status !== 'playing') return p
  if (index === total - 1) return p.sawLast ? p : { ...p, sawLast: true }
  if (index === 0 && p.sawLast) return { ...p, done: true }
  return p
}

// Панель уместна: активный живой слайд, у сцены есть проверяемое задание
export function taskAllowed({ info, active, live }) {
  return !!info && !!active && !!live
}
