import { validateSceneV2 } from './sceneValidate.js'
import { sceneNodeBudget, NODE_BUDGET } from './sceneBudget.js'
import { slotsFor } from './sprites/slots.js'
import { getSprite } from './sprites/spriteRegistry.js'
import { isObj } from './sceneConstants.js'
import { taskTargetLine, taskAnswers, keyTokens } from './sceneTask.js'

// Линтер сцен v2 — детерминированная проверка поверх валидатора: бюджет
// узлов, предметы без опоры, пустые слоты, качество диалога. Возвращает
// [{ level: 'error' | 'warn', text }]; error — сцену не публикуем, warn —
// показать автору/нейросети и дать поправить. Все сообщения по-русски.
// Ту же функцию зовёт scripts/lint-scene.mjs.

const SOFT_TEXT_LEN = 110
const MAX_SAME_SPEAKER_IN_ROW = 2

function lintSlots(scene, out) {
  const slots = isObj(scene.slots) ? scene.slots : {}
  const defs = slotsFor(scene.location)
  const empty = defs.filter(d => !slots[d.id]).map(d => d.id)
  if (empty.length === defs.length) out.push({ level: 'warn', text: 'slots — все слоты пустые: сцена будет голой (пол и стена без предметов)' })
  else if (empty.length) out.push({ level: 'warn', text: `slots — пустые слоты: ${empty.join(', ')}` })
  for (const d of defs) {
    const id = slots[d.id]
    if (!id) continue
    if (d.needs && !slots[d.needs]) out.push({ level: 'error', text: `slots.${d.id} — предмет '${id}' стоит на столе, но слот '${d.needs}' пуст (предмет висит в воздухе)` })
    const sprite = getSprite(id)
    if (sprite && !sprite.slots.some(s => s === `${scene.location}/${d.id}`)) {
      out.push({ level: 'error', text: `slots.${d.id} — '${id}' не совместим со слотом` })
    }
  }
  const used = Object.values(slots).filter(Boolean)
  const dup = used.filter((v, i) => used.indexOf(v) !== i)
  if (dup.length) out.push({ level: 'warn', text: `slots — предмет повторяется: ${[...new Set(dup)].join(', ')}` })
}

function lintCharacters(scene, out) {
  const { a, b } = scene.characters ?? {}
  if (!isObj(a) || !isObj(b)) return
  if (a.name && b.name && a.name.trim().toLowerCase() === b.name.trim().toLowerCase()) out.push({ level: 'warn', text: 'characters — у обоих персонажей одно имя' })
  const furA = a.palette?.fur?.toLowerCase(), furB = b.palette?.fur?.toLowerCase()
  if (furA && furB && furA === furB && a.gender === b.gender) out.push({ level: 'warn', text: 'characters — одинаковый цвет шерсти и пол: котов не отличить' })
}

function lintTimeline(scene, out) {
  const tl = Array.isArray(scene.timeline) ? scene.timeline : []
  const speakers = new Set(tl.map(l => l?.who))
  for (const k of ['a', 'b']) if (tl.length && !speakers.has(k)) out.push({ level: 'warn', text: `timeline — персонаж '${k}' ни разу не говорит` })
  let run = 0
  tl.forEach((l, i) => {
    if (!isObj(l)) return
    run = i > 0 && tl[i - 1]?.who === l.who ? run + 1 : 1
    if (run === MAX_SAME_SPEAKER_IN_ROW + 1) out.push({ level: 'warn', text: `timeline[${i}] — '${l.who}' говорит ${run} реплики подряд: лучше чередовать` })
    const text = typeof l.text === 'string' ? l.text.trim() : ''
    if (text.length > SOFT_TEXT_LEN) out.push({ level: 'warn', text: `timeline[${i}].text — длинно (${text.length} символов), облачко займёт полэкрана` })
    if (text && !/[.!?…»)]$/.test(text)) out.push({ level: 'warn', text: `timeline[${i}].text — реплика без знака в конце` })
    if (l.audioUrl && !l.wordTimings) out.push({ level: 'warn', text: `timeline[${i}] — есть audioUrl, но нет wordTimings: рот пойдёт по таймеру` })
  })
  if (tl.length >= 2 && tl.every(l => l?.emotion === tl[0]?.emotion)) out.push({ level: 'warn', text: 'timeline — одна эмоция на всю сцену: лица не меняются' })
}

// Задание «О чём диалог» (sceneTask.js): ответ проверять нечем — ошибка; остальное — советы
const MIN_TASK_LINES = 3
function lintTask(scene, out) {
  if (scene.task === undefined || scene.task === null) return
  const target = taskTargetLine(scene)
  if (!target) return
  const answers = taskAnswers(scene.task, target.line)
  if (!answers.length) { out.push({ level: 'error', text: `task — у реплики №${target.index + 1} нет перевода (translation) и нет accept: ответ проверить нечем` }); return }
  const tl = Array.isArray(scene.timeline) ? scene.timeline : []
  if (tl.length < MIN_TASK_LINES) out.push({ level: 'warn', text: `task — диалог короче ${MIN_TASK_LINES} реплик: задание «о чём говорили» почти не о чём` })
  if (keyTokens(answers[0]).length < 2) out.push({ level: 'warn', text: `task — эталон «${answers[0]}» из одного значимого слова: ответ засчитается слишком легко` })
  if (answers.length === 1) out.push({ level: 'warn', text: 'task.accept — нет синонимичных переводов: засчитается только дословный ответ' })
  if (scene.task.lineIndex === null || scene.task.lineIndex === undefined) out.push({ level: 'warn', text: `task.lineIndex — реплика не выбрана, спрашивается №${target.index + 1} (последняя с переводом)` })
}

// nodeBudget — потолок узлов (по умолчанию NODE_BUDGET; админка сможет
// ужесточить для «слабого» тира)
export function lintScene(scene, { nodeBudget = NODE_BUDGET } = {}) {
  const out = []
  const errors = validateSceneV2(scene)
  errors.forEach(text => out.push({ level: 'error', text }))
  if (!isObj(scene)) return out
  if (!errors.some(e => e.startsWith('location'))) {
    const nodes = sceneNodeBudget(scene)
    if (nodes > nodeBudget) out.push({ level: 'error', text: `Бюджет узлов SVG: ${nodes} > ${nodeBudget} — уберите предметы из слотов` })
    lintSlots(scene, out)
  }
  lintCharacters(scene, out)
  lintTimeline(scene, out)
  lintTask(scene, out)
  return out
}

export function lintErrors(scene) {
  return lintScene(scene).filter(x => x.level === 'error').map(x => x.text)
}

// Плоский список строк с пометкой уровня — для консоли и textarea
export function lintSceneText(scene) {
  return lintScene(scene).map(x => `${x.level === 'error' ? 'Ошибка' : 'Внимание'}: ${x.text}`)
}
