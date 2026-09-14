import { layerShots } from './tableDictatorTiming.js'
import { normalizeAnswerText } from './tableCellMatch.js'
import { fileToTimelineTime } from './audioClips.js'

// Математика голосового тренажёра «Переверни телефон» (speech-lane): где
// слово в момент t, когда оно «горит», как разложить клипы по озвучке.
// Одни и те же функции читает редактор таймлайна (превью в канвасе) и плеер
// (полёт слов на телефоне) — чтобы монтаж не расходился с уроком, как у
// таблицы-диктора (tableDictatorTiming.js).
//
// Слой: { id, text, role: 'coach'|'user'|'translation', lane: 0..2,
//         clips: [{start, end}], repeats: [{start, end}], visible }
// Клип — полёт слова от верхнего края экрана (start) до нижнего (end).
// Круг стоит в центре, значит слово проходит через него в середине клипа —
// это момент «говорить».
// role 'translation' — отдельная дорожка перевода: не летит, а показывается
// сверху экрана ровно на длину клипа (появление/уход — анимация в сцене).

export const LANES = 3
// Полёт по умолчанию (для авто-раскладки и новых дорожек)
export const FLIGHT_S = 2.4
// Слово горит около момента прохода через круг, если точного окна нет
// (у ученика — всегда; у диктора — если слово не нашлось в озвучке)
export const HIT_BEFORE_S = 0.15
export const HIT_AFTER_S  = 0.35
// Последнее слово озвучки: тайминг даёт только начало, конец берём так
export const LAST_WORD_S = 0.4
// Сколько до конца клипа перевод уже «уходит» (анимация исчезновения)
export const TRANSLATION_OUT_S = 0.35

export { layerShots }

export const isTranslation = l => l?.role === 'translation'

export function hitTime(shot) {
  return shot.start + (shot.end - shot.start) / 2
}

// 0 — у верхнего края, 1 — ушло за нижний. null — не в полёте
export function shotProgress(shot, t) {
  const dur = shot.end - shot.start
  if (dur <= 0 || t < shot.start || t >= shot.end) return null
  return (t - shot.start) / dur
}

export function shotKey(layerId, i) { return `${layerId}#${i}` }

// Все слова, которые видны в момент t, с их положением по дорожке
export function frameLayout(layers, t) {
  const out = []
  for (const l of layers ?? []) {
    if (l.visible === false || isTranslation(l)) continue
    layerShots(l).forEach((shot, i) => {
      const progress = shotProgress(shot, t)
      if (progress == null) return
      out.push({ key: shotKey(l.id, i), layerId: l.id, shotIdx: i, lane: l.lane ?? 0,
        role: l.role ?? 'coach', text: l.text ?? '', translation: l.translation ?? '', progress, shot })
    })
  }
  return out
}

// Активное слово (перевод сверху и цвет круга — с него): из летящих берём
// то, что ближе к кругу. null — когда ничего не летит
export function activeWord(layers, t) {
  let best = null
  for (const w of frameLayout(layers, t)) {
    const d = Math.abs(w.progress - 0.5)
    if (!best || d < best.d) best = { d, key: w.key, role: w.role, translation: w.translation, text: w.text }
  }
  return best ? { key: best.key, role: best.role, text: best.text, translation: best.translation } : null
}

// Перевод сверху в момент t — с дорожки перевода (своя, независимая от слов).
// out — клип кончается, пора анимировать уход. Нет дорожки перевода вовсе —
// запасной вариант: перевод из поля активного слова (старые ноды)
export function activeTranslation(layers, t) {
  let hasTrack = false
  for (const l of layers ?? []) {
    if (!isTranslation(l) || l.visible === false) continue
    hasTrack = true
    const shots = layerShots(l)
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i]
      if (t >= s.start && t < s.end) {
        return { key: shotKey(l.id, i), text: l.text ?? '', out: t >= s.end - TRANSLATION_OUT_S }
      }
    }
  }
  if (hasTrack) return null
  const w = activeWord(layers, t)
  return w?.translation ? { key: w.key, text: w.translation, out: false } : null
}

// ---- окна «горения» ------------------------------------------------------

function stripPunct(w) {
  return w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
}

// Все места в озвучке, где прозвучал text (слово или фраза подряд), в
// секундах ФАЙЛА. Конец — начало следующего слова (у последнего — +LAST_WORD_S)
export function findPhraseOccurrences(wordTimings, text) {
  const target = normalizeAnswerText(text ?? '').split(' ').filter(Boolean)
  if (!target.length) return []
  const flat = (wordTimings ?? [])
    .map(wt => ({ tok: stripPunct(normalizeAnswerText(wt.w)), t: wt.t }))
    .filter(f => f.tok)
  const out = []
  for (let i = 0; i + target.length <= flat.length; i++) {
    let ok = true
    for (let k = 0; k < target.length; k++) if (flat[i + k].tok !== target[k]) { ok = false; break }
    if (!ok) continue
    const last = i + target.length
    out.push({ start: flat[i].t, end: last < flat.length ? flat[last].t : flat[last - 1].t + LAST_WORD_S })
    i = last - 1
  }
  return out
}

// Окно во времени ТАЙМЛАЙНА, когда слово реально звучит — с учётом нарезки
// (кусок файла мог уехать или быть вырезан). null — не звучит
export function occurrenceOnTimeline(occ, audioClips) {
  const s = fileToTimelineTime(audioClips, occ.start)
  if (s == null) return null
  const e = fileToTimelineTime(audioClips, Math.max(occ.start, occ.end - 0.001))
  return { start: s, end: e == null ? s + (occ.end - occ.start) : e + 0.001 }
}

// Окно «горит» для каждого вылета слова диктора: Map<shotKey, {start,end}>.
// Главнее всего — ручная привязка: у куска озвучки стоит layerId («на этом
// куске светится это слово») — окно = кусок ∩ полёт (bound: true). Иначе ищем
// озвучку этого слова по таймингам, попавшую в полёт; не нашлось — окно
// вокруг прохода через круг (fallback). У ученика окно всегда «вокруг круга»
// — плеер использует его как подсказку, когда ждать голос
export function litWindows(layers, wordTimings, audioClips) {
  const map = new Map()
  const occCache = new Map()
  const bound = new Map()   // layerId → куски, привязанные к слою
  for (const c of audioClips ?? []) {
    if (!c.layerId) continue
    if (!bound.has(c.layerId)) bound.set(c.layerId, [])
    bound.get(c.layerId).push({ start: c.at, end: c.at + c.len })
  }
  for (const l of layers ?? []) {
    if (l.visible === false || isTranslation(l)) continue
    const isCoach = (l.role ?? 'coach') === 'coach'
    if (isCoach && !occCache.has(l.text)) {
      occCache.set(l.text, findPhraseOccurrences(wordTimings, l.text)
        .map(o => occurrenceOnTimeline(o, audioClips)).filter(Boolean))
    }
    const occs = isCoach ? occCache.get(l.text) : []
    layerShots(l).forEach((shot, i) => {
      const hit = hitTime(shot)
      const fallback = { start: hit - HIT_BEFORE_S, end: hit + HIT_AFTER_S, fallback: true }
      let win = fallback
      let bestD = Infinity
      for (const o of occs) {
        if (o.end <= shot.start || o.start >= shot.end) continue
        const d = Math.abs((o.start + o.end) / 2 - hit)
        if (d < bestD) { bestD = d; win = { start: o.start, end: o.end } }
      }
      for (const b of bound.get(l.id) ?? []) {
        if (b.end <= shot.start || b.start >= shot.end) continue
        win = { start: Math.max(b.start, shot.start), end: Math.min(b.end, shot.end), bound: true }
        break
      }
      map.set(shotKey(l.id, i), win)
    })
  }
  return map
}

// ---- дорожки и раскладка --------------------------------------------------

function overlaps(a, b) { return a.start < b.end && b.start < a.end }

// Первая дорожка, где в это время никто не летит (свои вылеты не считаем)
export function freeLane(layers, shot, excludeLayerId = null) {
  for (let lane = 0; lane < LANES; lane++) {
    const busy = (layers ?? []).some(l => l.id !== excludeLayerId && (l.lane ?? 0) === lane
      && l.visible !== false && !isTranslation(l) && layerShots(l).some(s => overlaps(s, shot)))
    if (!busy) return lane
  }
  return 0
}

// Вылеты, которые накладываются на вылет ДРУГОГО слоя в той же дорожке —
// редактор подсвечивает их как столкновение. Свои повторы («I, I, I» подряд)
// не считаются: они летят друг за другом на разной высоте, это и есть замысел.
// Set<shotKey>
export function laneCollisions(layers) {
  const bad = new Set()
  const all = []
  for (const l of layers ?? []) {
    if (l.visible === false || isTranslation(l)) continue
    layerShots(l).forEach((shot, i) => all.push({ key: shotKey(l.id, i), layerId: l.id, lane: l.lane ?? 0, shot }))
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].layerId === all[j].layerId) continue
      if (all[i].lane !== all[j].lane || !overlaps(all[i].shot, all[j].shot)) continue
      bad.add(all[i].key); bad.add(all[j].key)
    }
  }
  return bad
}

// «🪄 Смонтировать» и запасной вариант плеера для уроков без таймлайна:
// каждому слою диктора — по вылету на каждое звучание его слова в озвучке,
// полёт FLIGHT_S с центром на середине звучания. Слои ученика не трогаем —
// когда ученику повторять, решает автор. Дорожка — первая свободная
export function autoLayoutCoach(layers, wordTimings, audioClips, timelineLen) {
  let out = (layers ?? []).map(l => ({ ...l }))
  for (const l of out) {
    if ((l.role ?? 'coach') !== 'coach') continue
    const shots = findPhraseOccurrences(wordTimings, l.text)
      .map(o => occurrenceOnTimeline(o, audioClips)).filter(Boolean)
      .map(o => {
        const mid = (o.start + o.end) / 2
        const start = Math.max(0, mid - FLIGHT_S / 2)
        return { start, end: Math.min(timelineLen, start + FLIGHT_S) }
      })
      .filter(s => s.end - s.start > 0.2)
    if (!shots.length) continue
    l.clips = [shots[0]]
    l.repeats = shots.slice(1)
    l.lane = freeLane(out, shots[0], l.id)
  }
  return out
}
