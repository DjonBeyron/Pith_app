import { LIMITS, EMOTIONS, POSES } from '../../scene/v2/sceneConstants.js'

// Операции над таймлайном реплик сборщика — чистые функции над массивом Line
// ({ who, text, emotion, pose, translation?, audioUrl?, wordTimings? }).
// Сами реплики не валидируются (это sceneValidate/sceneLint): здесь только
// структура списка — добавить, удалить, подвинуть, поменять поле.

export const MAX_TEXT = LIMITS.maxTextLen
export const MAX_LINES = LIMITS.maxLines
export const MIN_LINES = LIMITS.minLines

// Новая реплика после afterIndex (по умолчанию — в конец): говорит тот, кто не говорил
// в предыдущей, эмоция нейтральная
export function addLine(timeline, afterIndex = timeline.length - 1) {
  if (timeline.length >= MAX_LINES) return timeline
  const i = Math.max(-1, Math.min(afterIndex, timeline.length - 1))
  const prev = timeline[i]
  const line = { who: prev?.who === 'a' ? 'b' : 'a', text: '', emotion: 'neutral', pose: 'talk' }
  return [...timeline.slice(0, i + 1), line, ...timeline.slice(i + 1)]
}

export function removeLine(timeline, index) {
  if (index < 0 || index >= timeline.length) return timeline
  return timeline.filter((_, i) => i !== index)
}

// dir: -1 вверх, +1 вниз; у края — без изменений (тот же массив)
export function moveLine(timeline, index, dir) {
  const j = index + dir
  if (index < 0 || index >= timeline.length || j < 0 || j >= timeline.length) return timeline
  const out = [...timeline]
  ;[out[index], out[j]] = [out[j], out[index]]
  return out
}

// Правка поля: пустые необязательные (translation, audioUrl) удаляются из объекта,
// текст режется по лимиту, who/emotion/pose вне словаря игнорируются
export function updateLine(timeline, index, patch) {
  if (index < 0 || index >= timeline.length) return timeline
  const cur = { ...timeline[index] }
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'who') { if (v === 'a' || v === 'b') cur.who = v; continue }
    if (k === 'emotion') { if (EMOTIONS.includes(v)) cur.emotion = v; continue }
    if (k === 'pose') { if (POSES.includes(v)) cur.pose = v; continue }
    if (k === 'text') { cur.text = String(v ?? '').slice(0, MAX_TEXT); continue }
    if (k === 'translation' || k === 'audioUrl') {
      const s = String(v ?? '').trim()
      if (s) cur[k] = s; else delete cur[k]
      continue
    }
    if (v === undefined || v === null) delete cur[k]; else cur[k] = v
  }
  return timeline.map((l, i) => (i === index ? cur : l))
}

export function duplicateLine(timeline, index) {
  if (index < 0 || index >= timeline.length || timeline.length >= MAX_LINES) return timeline
  return [...timeline.slice(0, index + 1), { ...timeline[index] }, ...timeline.slice(index + 1)]
}

// Статус озвучки реплики для бейджа: 'none' — нет файла (заготовка под ElevenLabs),
// 'file' — есть audioUrl без таймингов (рот по таймеру), 'timed' — файл с wordTimings
export function audioStatus(line) {
  if (!line?.audioUrl) return 'none'
  return Array.isArray(line.wordTimings) && line.wordTimings.length ? 'timed' : 'file'
}

export const AUDIO_STATUS_LABEL = { none: 'нет файла', file: 'файл без таймингов', timed: 'файл + тайминги' }

// Остаток символов для счётчика (отрицательный — перебор)
export function charsLeft(text) {
  return MAX_TEXT - String(text ?? '').trim().length
}
