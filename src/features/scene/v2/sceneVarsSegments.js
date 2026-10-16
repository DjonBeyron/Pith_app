import { isObj } from './sceneConstants.js'
import { tokenizeTemplate } from './sceneVarsTokens.js'

// Озвучка реплики-шаблона по частям (шаг 4б; чистая логика без сети и React). Текст «Can I have {food}, please?»
// режется по плейсхолдерам на части: [{ text: 'Can I have' }, { var: 'food' }, { text: ', please?' }]. Текстовые части
// озвучивает админ в сборщике (тот же голос и модель, что у целой реплики; hash = текст части + голос), слово
// подставляется из библиотеки word_audio (sceneWordSegments.js). Целиком такая реплика не озвучивается.
//
// Границы: части режутся по плейсхолдерам {name}; пробелы по краям части отбрасываются (в озвучку и hash идёт обрезанный
// текст), пустые части (плейсхолдер в начале/конце, два подряд) пропадают; {{ и }} — литеральные скобки внутри части.
// Часть без единой буквы/цифры («?», «.», «…») не озвучивается вовсе и в цепочке пропускается (mute).

export const hasLetters = s => /[\p{L}\p{N}]/u.test(String(s ?? ''))

// Части текста-шаблона: [{ text } | { var }]
export function splitTemplate(text) {
  const parts = []
  let buf = ''
  const flush = () => { const t = buf.trim(); if (t) parts.push({ text: t }); buf = '' }
  for (const t of tokenizeTemplate(text)) {
    if (t.name) { flush(); parts.push({ var: t.name }) } else buf += t.lit ?? t.stray
  }
  flush()
  return parts
}

// Реплика-шаблон под озвучку по частям: в text есть хотя бы один плейсхолдер {name}
export const hasVarParts = text => tokenizeTemplate(text).some(t => t.name)

// Текстовые части, которые нужно озвучить (с буквами)
export const voicedParts = text => splitTemplate(text).filter(p => p.text !== undefined && hasLetters(p.text))

const storedTexts = line => (Array.isArray(line?.segments) ? line.segments.filter(s => isObj(s) && s.var === undefined && typeof s.text === 'string') : [])
const AUDIO_KEYS = ['audioUrl', 'wordTimings', 'audioMeta']

// Сегменты реплики в сборщике: каркас по текущему тексту; озвучка старых частей остаётся, если текст части тот же
export function templateSegments(line) {
  const stored = storedTexts(line)
  const used = new Set()
  return splitTemplate(line?.text).map(p => {
    if (p.var !== undefined) return { var: p.var }
    const k = stored.findIndex((s, j) => !used.has(j) && s.text.trim() === p.text && s.audioUrl)
    if (k < 0) return { text: p.text }
    used.add(k)
    const seg = { text: p.text }
    for (const key of AUDIO_KEYS) if (stored[k][key] !== undefined) seg[key] = stored[k][key]
    return seg
  })
}

// Положить озвучку (нейтральный patch { audioUrl, wordTimings, audioMeta }) в текстовую часть с индексом seg
export function setSegmentAudio(line, seg, patch) {
  const segments = templateSegments(line)
  if (!segments[seg] || segments[seg].var !== undefined) return segments
  const next = { text: segments[seg].text }
  for (const key of AUDIO_KEYS) if (patch?.[key] !== undefined) next[key] = patch[key]
  segments[seg] = next
  return segments
}

// Сегмент-источник готового файла (кэш по hash в плане озвучки): нейтральный patch или null
export function segmentPatch(line, seg) {
  const s = Array.isArray(line?.segments) ? line.segments[seg] : null
  if (!isObj(s) || !s.audioUrl) return null
  const patch = { audioUrl: s.audioUrl }
  if (s.wordTimings) patch.wordTimings = s.wordTimings
  if (s.audioMeta) patch.audioMeta = s.audioMeta
  return patch
}

// Все ссылки на файлы сегментов реплики (для прогрева, подсчёта файлов-сирот)
export function segmentUrls(line) {
  return Array.isArray(line?.segments) ? line.segments.map(s => (isObj(s) ? s.audioUrl : null)).filter(u => typeof u === 'string' && u) : []
}
