import { isObj } from './sceneConstants.js'
import { audioHash, voiceSpec } from './sceneVoiceSpec.js'
import { splitTemplate, hasLetters } from './sceneVarsSegments.js'

// Статус озвучки частей реплики-шаблона (чистая логика; части и сборка segments — sceneVarsSegments.js).
// Часть озвучена, если в segments есть текстовый сегмент с тем же (обрезанным) текстом и audioUrl; hash сегмента
// (текст части + голос персонажа + модель) совпал с текущим голосом — «актуально», нет — «устарело». Совпадение
// идёт по тексту, а не по позиции: правка соседней части не сбрасывает озвучку остальных.

// → { parts: [{ k, text, hash, state: 'ready' | 'stale' | 'none', seg }], leftover }
//   k — индекс части в splitTemplate(text) (он же индекс сегмента после сборки каркаса templateSegments);
//   leftover — файлов в segments, которым в тексте больше нет части (текст правили после озвучки)
export function segmentParts(line, character) {
  const spec = voiceSpec(character)
  const stored = Array.isArray(line?.segments) ? line.segments.filter(s => isObj(s) && s.var === undefined && typeof s.text === 'string') : []
  const used = new Set()
  const parts = []
  splitTemplate(line?.text).forEach((p, k) => {
    if (p.text === undefined || !hasLetters(p.text)) return
    const hash = audioHash(p.text, spec)
    const j = stored.findIndex((s, n) => !used.has(n) && s.text.trim() === p.text && s.audioUrl)
    if (j < 0) { parts.push({ k, text: p.text, hash, state: 'none', seg: null }); return }
    used.add(j)
    const h = stored[j].audioMeta?.hash
    parts.push({ k, text: p.text, hash, state: !h || h === hash ? 'ready' : 'stale', seg: stored[j] })
  })
  return { parts, leftover: stored.filter((s, n) => !used.has(n) && s.audioUrl).length }
}

// → { state, total, ready, stale, leftover }; state: 'empty' — озвучивать нечего (одни плейсхолдеры/знаки) | 'none' | 'partial' |
//   'ready' | 'stale' (hash части не сходится, либо остались файлы частей, которых в тексте уже нет)
export function segmentsStatus(line, character) {
  const { parts, leftover } = segmentParts(line, character)
  const total = parts.length
  const ready = parts.filter(p => p.state === 'ready').length
  const stale = parts.filter(p => p.state === 'stale').length
  let state = 'partial'
  if (!total && !leftover) state = 'empty'
  else if (stale || leftover) state = 'stale'
  else if (ready === total) state = 'ready'
  else if (!ready) state = 'none'
  return { state, total, ready, stale, leftover }
}

// Состояние строки как у обычной реплики (для счётчиков «озвучено N из M»): 'ready' | 'stale' | 'none' | null (озвучивать нечего)
export function segmentsLineState(line, character) {
  const st = segmentsStatus(line, character).state
  return st === 'empty' ? null : st === 'partial' ? 'none' : st
}
