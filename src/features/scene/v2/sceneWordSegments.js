import { lookupWordAudio } from '../../../shared/lib/wordAudio/wordAudioLookup.js'
import { isObj } from './sceneConstants.js'

// Сегменты-слова реплики-шаблона (озвучка по частям, шаг 4б): подставленное слово становится сегментом
// { text, word: true, audioUrl?, wordTimings? } — аудио берётся из библиотеки word_audio (wordAudioLookup.js).
// Тайминги слов в библиотеке не хранятся, поэтому при известной длительности делим её поровну между словами
// фразы БЕЗ пауз (0…duration) — режиссёр такой сегмент не обрезает по хвосту тишины, он играет до конца файла.
// Без аудио слово остаётся сегментом без audioUrl: реплика целиком уйдёт на запасной синтез устройства.

// Равномерные тайминги по словам: доли длительности по длине слова (+1, как syntheticTimings); нет длительности — null
export function uniformTimings(text, duration) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  if (!words.length || !(duration > 0)) return null
  const weights = words.map(w => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1)
  const total = weights.reduce((s, w) => s + w, 0)
  let acc = 0
  return words.map((word, i) => {
    const start = Math.round(acc * 100) / 100
    acc += (duration * weights[i]) / total
    return { word, start, end: Math.round(Math.max(acc, start + 0.01) * 100) / 100 }
  })
}

// Сегмент для подставленного слова; wordAudio — лукап/карта (undefined — источник по умолчанию, null — без озвучки)
export function wordSegment(word, wordAudio) {
  const text = String(word ?? '').trim()
  const seg = { text, word: true }
  const row = lookupWordAudio(text, wordAudio)
  if (row) {
    seg.audioUrl = row.url
    const t = uniformTimings(text, row.duration)
    if (t) seg.wordTimings = t
  }
  return seg
}

// Тексты слов-сегментов без аудио (для прогрева библиотеки перед показом)
export function pendingWordTexts(scene) {
  const out = new Set()
  for (const l of Array.isArray(scene?.timeline) ? scene.timeline : []) {
    if (!Array.isArray(l?.segments)) continue
    for (const s of l.segments) if (isObj(s) && s.word && !s.audioUrl && typeof s.text === 'string' && s.text.trim()) out.add(s.text.trim())
  }
  return [...out]
}

// Дотянуть аудио слов-сегментов из библиотеки (после прогрева): новая сцена, если что-то изменилось, иначе та же ссылка
export function attachWordAudio(scene, wordAudio) {
  if (!pendingWordTexts(scene).length) return scene
  let changed = false
  const timeline = scene.timeline.map(l => {
    if (!Array.isArray(l?.segments)) return l
    let lineChanged = false
    const segments = l.segments.map(s => {
      if (!isObj(s) || !s.word || s.audioUrl) return s
      const next = wordSegment(s.text, wordAudio)
      if (!next.audioUrl) return s
      lineChanged = true
      return next
    })
    if (!lineChanged) return l
    changed = true
    return { ...l, segments }
  })
  return changed ? { ...scene, timeline } : scene
}
