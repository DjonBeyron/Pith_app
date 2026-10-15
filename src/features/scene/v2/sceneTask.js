import { levenshtein, tolerance } from '../../../shared/lib/speech/speechMatch.js'
import { isObj, LIMITS } from './sceneConstants.js'

// Задание после сцены «О чём диалог» — необязательное поле сцены v2 (версия формата
// остаётся 2, старые сцены без поля валидны):
//   scene.task = { kind: 'translate', lineIndex: int | null, prompt?, accept: string[], hint? }
// lineIndex — какая реплика спрашивается; null → последняя реплика с translation,
// иначе последняя. Правильный ответ = translation целевой реплики + accept[] (синонимы).
// Здесь — чистые функции: нормализация, выбор реплики, нечёткая проверка смысла.
// Проверка: регистр/ё/пунктуация не важны, стоп-слова отбрасываются, каждое ключевое
// слово эталона ищется среди слов ответа с допуском по Левенштейну (tolerance из
// speechMatch.js — те же пороги, что у «Сказать фразу»); засчитано, если совпало
// ≥ PASS_RATIO ключевых слов лучшего из эталонов. Пустой ответ — не ок.

// Виды: translate — печатать перевод; say — ответить голосом своими словами (answers/keywords);
// repeat — повторить голосом оригинал реплики. Голосовая проверка — sceneTaskVoice.js
export const TASK_KINDS = ['translate', 'say', 'repeat']
export const VOICE_KINDS = ['say', 'repeat']
export const TASK_LIMITS = { maxPrompt: 80, maxAccept: 8, maxAcceptLen: 140, maxHint: 140, maxAnswers: 8, maxKeywords: 12, maxKeywordLen: 40, minPass: 0.5, maxPass: 1 }
export const PASS_RATIO = 0.7

// Минимум реплик сцены зависит от задания: say/repeat — одна («кот сказал — ты повторил/ответил»),
// без задания и translate («О чём диалог», нужен контекст) — две. Единственное место правила.
export function minLinesFor(scene) {
  return VOICE_KINDS.includes(scene?.task?.kind) ? LIMITS.minLinesVoice : LIMITS.minLines
}

// Служебные слова, которые не несут смысла: их отсутствие или замена ответ не портят
const STOP_WORDS = new Set([
  'и', 'а', 'но', 'да', 'же', 'ли', 'бы', 'б', 'ну', 'вот', 'ведь', 'то', 'это', 'этот', 'эта', 'эти', 'тот', 'та', 'те',
  'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'у', 'о', 'об', 'от', 'до', 'из', 'за', 'по', 'под', 'над', 'при', 'про', 'для', 'без',
  'я', 'ты', 'он', 'она', 'оно', 'они', 'мы', 'вы', 'мне', 'меня', 'тебе', 'тебя', 'ему', 'его', 'ей', 'ее', 'нам', 'нас', 'вам', 'вас', 'им', 'их',
  'мой', 'моя', 'мое', 'мои', 'твой', 'твоя', 'твое', 'твои', 'наш', 'наша', 'наше', 'наши', 'ваш', 'ваша', 'ваше', 'ваши', 'свой', 'своя', 'свое', 'свои',
  'что', 'чтобы', 'как', 'так', 'уже', 'еще', 'тоже', 'только', 'очень', 'просто', 'разве', 'все', 'всё', 'сам', 'сама', 'сами',
  'не', 'нет', 'ни', 'ой', 'ах', 'ох', 'эй', 'ага',
  // Английские (если эталон на английском): артикли, связки, местоимения
  'the', 'a', 'an', 'is', 'are', 'am', 'was', 'were', 'be', 'to', 'of', 'and', 'or', 'but', 'in', 'on', 'at', 'for', 'with',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'do', 'does', 'did', 'not',
])

export function normalizeTask(raw) {
  if (!isObj(raw) || !TASK_KINDS.includes(raw.kind)) return null
  const out = { kind: raw.kind, lineIndex: null, accept: [] }
  if (Number.isInteger(raw.lineIndex) && raw.lineIndex >= 0) out.lineIndex = raw.lineIndex
  if (typeof raw.prompt === 'string' && raw.prompt.trim()) out.prompt = raw.prompt.trim().slice(0, TASK_LIMITS.maxPrompt)
  if (Array.isArray(raw.accept)) {
    out.accept = [...new Set(raw.accept.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim().slice(0, TASK_LIMITS.maxAcceptLen)))]
      .slice(0, TASK_LIMITS.maxAccept)
  }
  if (typeof raw.hint === 'string' && raw.hint.trim()) out.hint = raw.hint.trim().slice(0, TASK_LIMITS.maxHint)
  if (VOICE_KINDS.includes(raw.kind)) normalizeVoiceFields(raw, out)
  return out
}

const strList = (v, max, len) => (Array.isArray(v)
  ? [...new Set(v.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim().slice(0, len)))].slice(0, max) : [])

// Поля голосовых видов: answers (только say), keywords (только say), passRatio 0.5..1, strict
function normalizeVoiceFields(raw, out) {
  if (raw.kind === 'say') {
    out.answers = strList(raw.answers, TASK_LIMITS.maxAnswers, TASK_LIMITS.maxAcceptLen)
    const keywords = strList(raw.keywords, TASK_LIMITS.maxKeywords, TASK_LIMITS.maxKeywordLen)
    if (keywords.length) out.keywords = keywords
  }
  if (typeof raw.passRatio === 'number' && raw.passRatio >= TASK_LIMITS.minPass && raw.passRatio <= TASK_LIMITS.maxPass) out.passRatio = raw.passRatio
  if (raw.strict === true) out.strict = true
}

function validateVoiceFields(task, errors) {
  if (task.answers !== undefined) {
    if (!Array.isArray(task.answers)) errors.push('task.answers — массив строк (ожидаемые ответы)')
    else {
      if (task.answers.length > TASK_LIMITS.maxAnswers) errors.push(`task.answers — не больше ${TASK_LIMITS.maxAnswers} ответов (сейчас ${task.answers.length})`)
      task.answers.forEach((a, i) => {
        if (typeof a !== 'string' || !a.trim()) errors.push(`task.answers[${i}] — непустая строка`)
        else if (a.length > TASK_LIMITS.maxAcceptLen) errors.push(`task.answers[${i}] — не длиннее ${TASK_LIMITS.maxAcceptLen} символов`)
      })
    }
  }
  if (task.keywords !== undefined) {
    if (!Array.isArray(task.keywords)) errors.push('task.keywords — массив ключевых слов')
    else {
      if (task.keywords.length > TASK_LIMITS.maxKeywords) errors.push(`task.keywords — не больше ${TASK_LIMITS.maxKeywords} слов (сейчас ${task.keywords.length})`)
      task.keywords.forEach((k, i) => {
        if (typeof k !== 'string' || !k.trim()) errors.push(`task.keywords[${i}] — непустая строка`)
        else if (k.length > TASK_LIMITS.maxKeywordLen) errors.push(`task.keywords[${i}] — не длиннее ${TASK_LIMITS.maxKeywordLen} символов`)
      })
    }
  }
  if (task.passRatio !== undefined && !(typeof task.passRatio === 'number' && task.passRatio >= TASK_LIMITS.minPass && task.passRatio <= TASK_LIMITS.maxPass)) {
    errors.push(`task.passRatio — число от ${TASK_LIMITS.minPass} до ${TASK_LIMITS.maxPass}`)
  }
  if (task.strict !== undefined && typeof task.strict !== 'boolean') errors.push('task.strict — true или false')
}

// Ошибки формата поля task (вызывает validateSceneV2); timelineLen — для проверки lineIndex
export function validateTask(task, timelineLen, errors) {
  if (task === undefined || task === null) return
  if (!isObj(task)) { errors.push('task — объект { kind, lineIndex, accept, … } или отсутствует'); return }
  if (!TASK_KINDS.includes(task.kind)) errors.push(`task.kind — ${TASK_KINDS.join(' | ')}`)
  if (task.lineIndex !== undefined && task.lineIndex !== null) {
    if (!Number.isInteger(task.lineIndex) || task.lineIndex < 0) errors.push('task.lineIndex — номер реплики (целое от 0) или null')
    else if (typeof timelineLen === 'number' && task.lineIndex >= timelineLen) errors.push(`task.lineIndex — реплики №${task.lineIndex + 1} нет (всего ${timelineLen})`)
  }
  if (task.prompt !== undefined && (typeof task.prompt !== 'string' || task.prompt.length > TASK_LIMITS.maxPrompt)) errors.push(`task.prompt — строка до ${TASK_LIMITS.maxPrompt} символов`)
  if (task.accept !== undefined) {
    if (!Array.isArray(task.accept)) errors.push('task.accept — массив строк (допустимые переводы)')
    else {
      if (task.accept.length > TASK_LIMITS.maxAccept) errors.push(`task.accept — не больше ${TASK_LIMITS.maxAccept} вариантов (сейчас ${task.accept.length})`)
      task.accept.forEach((a, i) => {
        if (typeof a !== 'string' || !a.trim()) errors.push(`task.accept[${i}] — непустая строка`)
        else if (a.length > TASK_LIMITS.maxAcceptLen) errors.push(`task.accept[${i}] — не длиннее ${TASK_LIMITS.maxAcceptLen} символов`)
      })
    }
  }
  if (task.hint !== undefined && (typeof task.hint !== 'string' || task.hint.length > TASK_LIMITS.maxHint)) errors.push(`task.hint — строка до ${TASK_LIMITS.maxHint} символов`)
  validateVoiceFields(task, errors)
}

// Какая реплика спрашивается → { index, line } | null (нет задания или реплик)
export function taskTargetLine(scene) {
  const task = normalizeTask(scene?.task)
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  if (!task || !tl.length) return null
  if (task.lineIndex !== null && task.lineIndex < tl.length) return { index: task.lineIndex, line: tl[task.lineIndex] }
  for (let i = tl.length - 1; i >= 0; i--) if (typeof tl[i]?.translation === 'string' && tl[i].translation.trim()) return { index: i, line: tl[i] }
  return { index: tl.length - 1, line: tl[tl.length - 1] }
}

// Все эталоны ответа (без пустых и повторов): translate — перевод реплики + accept;
// repeat — оригинал реплики (text) + accept; say — answers + accept
export function taskAnswers(task, line) {
  const t = normalizeTask(task)
  const own = t?.kind === 'repeat' ? line?.text : t?.kind === 'say' ? null : line?.translation
  const list = [...(t?.kind === 'say' ? t.answers : [typeof own === 'string' ? own.trim() : '']), ...(t?.accept ?? [])]
  return [...new Set(list.filter(Boolean))]
}

// Вопрос по умолчанию: «Что сказал Барсик?» / «Что сказала Мурка?»
export function taskPrompt(task, scene, line) {
  const t = normalizeTask(task)
  if (t?.prompt) return t.prompt
  const ch = scene?.characters?.[line?.who]
  if (t?.kind === 'repeat') return ch?.name ? `Повтори за ${ch.name}` : 'Повтори за диктором'
  if (t?.kind === 'say') return ch?.name ? `Ответь ${ch.name}` : 'Ответь коту'
  const verb = ch?.gender === 'female' ? 'сказала' : 'сказал'
  return ch?.name ? `Что ${verb} ${ch.name}?` : 'Что было сказано?'
}

// Нормализация текста ответа/эталона: регистр, ё→е, пунктуация и лишние пробелы
export function normalizeAnswer(text) {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

export const answerTokens = text => normalizeAnswer(text).split(' ').filter(Boolean)

// Ключевые слова эталона: без стоп-слов; если остались одни стоп-слова — все слова
export function keyTokens(text) {
  const all = answerTokens(text)
  const keys = all.filter(w => !STOP_WORDS.has(w))
  return keys.length ? keys : all
}

const near = (a, b) => levenshtein(a, b) <= tolerance(a.length)

// Сравнение ответа с одним эталоном → { score, matched, missing }
function matchOne(reference, inputTokens) {
  const keys = keyTokens(reference)
  const used = new Set()
  const missing = []
  let matched = 0
  for (const k of keys) {
    const j = inputTokens.findIndex((w, idx) => !used.has(idx) && near(k, w))
    if (j === -1) missing.push(k)
    else { used.add(j); matched += 1 }
  }
  return { score: keys.length ? matched / keys.length : 0, matched, missing }
}

// Ответ пользователя против задания → { ok, score 0..1, matchedAnswer, missingKeys, empty }
// matchedAnswer — эталон, с которым совпало лучше всего (его и показываем как «верный перевод»)
export function checkTaskAnswer(task, line, input) {
  const answers = taskAnswers(task, line)
  const tokens = answerTokens(input)
  if (!tokens.length || !answers.length) return { ok: false, score: 0, matchedAnswer: answers[0] ?? null, missingKeys: answers[0] ? keyTokens(answers[0]) : [], empty: !tokens.length }
  let best = null
  for (const ref of answers) {
    const r = matchOne(ref, tokens)
    if (!best || r.score > best.score || (r.score === best.score && r.missing.length < best.missing.length)) best = { ...r, ref }
  }
  // Очень короткий ответ не проходит случайно: совпавших слов должно быть не меньше двух, если эталон не из одного слова
  const enough = best.matched >= Math.min(2, keyTokens(best.ref).length)
  return { ok: best.score >= PASS_RATIO - 1e-9 && enough, score: best.score, matchedAnswer: best.ref, missingKeys: best.missing, empty: false }
}
