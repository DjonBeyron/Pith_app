import { validateSceneV2 } from './sceneValidate.js'
import { sceneNodeBudget, NODE_BUDGET } from './sceneBudget.js'
import { slotsFor } from './sprites/slots.js'
import { getSprite } from './sprites/spriteRegistry.js'
import { isObj } from './sceneConstants.js'
import { taskTargetLine, taskAnswers, keyTokens } from './sceneTask.js'
import { lineAudioState, translationAudioState, sceneVoiceStats } from './sceneVoice.js'
import { displayOfOptions, normalizeVoiceFlags } from './sceneOptions.js'
import { sceneByteSize, SCENE_MAX_BYTES } from './sceneNode.js'

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
  lintVoice(scene, tl, out)
}

// Озвучка ElevenLabs (sceneVoice.js): hash не сходится с текстом/голосом — файл устарел;
// озвучена часть реплик — остальные пойдут синтезом устройства, голоса будут разные
function lintVoice(scene, tl, out) {
  tl.forEach((l, i) => {
    if (isObj(l) && lineAudioState(l, scene.characters?.[l.who]) === 'stale') {
      out.push({ level: 'warn', text: `timeline[${i}].audioUrl — озвучка устарела: текст или голос изменили после генерации, переозвучьте` })
    }
  })
  const st = sceneVoiceStats(scene)
  const voiced = st.ready + st.stale
  if (voiced > 0 && voiced < st.total) out.push({ level: 'warn', text: `timeline — озвучено ${voiced} из ${st.total} реплик: остальные прозвучат синтезом устройства` })
  lintTranslationVoice(scene, tl, st.translation, out)
}

// Озвучка перевода (sceneOptions.voice.translation, поля translationAudio* реплики) и режим показа 'both'
function lintTranslationVoice(scene, tl, st, out) {
  tl.forEach((l, i) => {
    if (isObj(l) && translationAudioState(l, scene.characters?.[l.who], scene) === 'stale') {
      out.push({ level: 'warn', text: `timeline[${i}].translationAudioUrl — озвучка перевода устарела: перевод или голос изменили после генерации (или перевод убрали), переозвучьте` })
    }
  })
  const flags = normalizeVoiceFlags(scene.options?.voice)
  if (flags.translation) {
    if (!st.withText) out.push({ level: 'warn', text: 'options.voice.translation — включена озвучка перевода, но ни у одной реплики нет translation: озвучивать нечего' })
    else if (st.ready + st.stale < st.withText) out.push({ level: 'warn', text: `options.voice.translation — включена озвучка перевода, но файлы перевода есть у ${st.ready + st.stale} из ${st.withText} реплик: остальные прозвучат синтезом устройства или промолчат` })
  }
  if (displayOfOptions(scene.options) === 'both' && tl.length && !st.withText) {
    out.push({ level: 'warn', text: 'options.display — режим «текст + перевод» (both), но у реплик нет translation: покажется только оригинал' })
  }
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

// Размер сцены (CHECK таблицы scenes ≤ 64 КБ): тайминги двух комплектов озвучки — самое тяжёлое
// в JSON. ≥ 90% лимита — предупреждение, больше лимита — ошибка (библиотека не примет)
export const SIZE_WARN_SHARE = 0.9
export function lintSize(scene, out) {
  const bytes = sceneByteSize(scene)
  const kb = Math.round(bytes / 1024)
  if (bytes > SCENE_MAX_BYTES) out.push({ level: 'error', text: `timeline — сцена больше ${SCENE_MAX_BYTES / 1024} КБ (${kb} КБ): библиотека не примет, удалите часть озвучки или сократите реплики` })
  else if (bytes >= SCENE_MAX_BYTES * SIZE_WARN_SHARE) out.push({ level: 'warn', text: `timeline — сцена близка к лимиту ${SCENE_MAX_BYTES / 1024} КБ (${kb} КБ, ${Math.round((bytes / SCENE_MAX_BYTES) * 100)}%) из-за таймингов озвучки` })
}

// nodeBudget — потолок узлов (по умолчанию NODE_BUDGET; админка сможет
// ужесточить для «слабого» тира)
export function lintScene(scene, { nodeBudget = NODE_BUDGET } = {}) {
  const out = []
  const errors = validateSceneV2(scene)
  errors.forEach(text => out.push({ level: 'error', text }))
  if (!isObj(scene)) return out
  lintSize(scene, out)
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
