// Нарезка озвучки на таймлайне тренажёра — как в Premiere: один файл, из
// него на композицию положены куски. Клип: { id, at, from, len } — где на
// таймлайне начинается (at), с какой секунды файла берётся (from) и сколько
// длится (len). Между клипами тишина — это окно, когда говорит ученик. Сам
// файл не перекодируется никогда: это только разметка.
//
// Чистые функции, без React: ими пользуется и редактор (нарезка), и плеер
// (audioClipPlayer.js — во что перемотать <audio> в момент t), и
// speechLaneTiming.js (тайминги слов из времени файла во время таймлайна).

function uid() { return crypto.randomUUID() }

// Короче этого клип не режем: иначе от «щелчка» ножницами по краю оставался
// бы огрызок в пару миллисекунд, который ни увидеть, ни схватить
export const MIN_CLIP_S = 0.1

// Свежая озвучка ложится на таймлайн одним куском с нуля
export function defaultAudioClips(duration) {
  if (!duration) return []
  return [{ id: uid(), at: 0, from: 0, len: duration }]
}

export function sortAudioClips(clips) {
  return [...(clips ?? [])].sort((a, b) => a.at - b.at)
}

// Клип, в который попадает момент таймлайна t (конец исключающий)
export function audioClipAt(clips, t) {
  return (clips ?? []).find(c => t >= c.at && t < c.at + c.len) ?? null
}

// Время таймлайна → время в файле. null — в этот момент тишина
export function timelineToFileTime(clips, t) {
  const c = audioClipAt(clips, t)
  return c ? c.from + (t - c.at) : null
}

// Время в файле → время таймлайна. null — этот кусок файла вырезан.
// Если кусок положен дважды (клип продублировали) — берём самый ранний
export function fileToTimelineTime(clips, tf) {
  let best = null
  for (const c of clips ?? []) {
    if (tf < c.from || tf >= c.from + c.len) continue
    const t = c.at + (tf - c.from)
    if (best == null || t < best) best = t
  }
  return best
}

// Докуда тянется последний клип озвучки
export function audioClipsEnd(clips) {
  return (clips ?? []).reduce((m, c) => Math.max(m, c.at + c.len), 0)
}

// Разрезать клип по моменту таймлайна t — два клипа встык, файл продолжается
// без шва. У края (меньше MIN_CLIP_S с любой стороны) — ничего не делаем
export function splitAudioClip(clips, t) {
  const c = audioClipAt(clips, t)
  if (!c) return clips
  const left = t - c.at
  if (left < MIN_CLIP_S || c.len - left < MIN_CLIP_S) return clips
  const a = { ...c, len: left }
  const b = { id: uid(), at: t, from: c.from + left, len: c.len - left }
  return sortAudioClips(clips.flatMap(x => (x.id === c.id ? [a, b] : [x])))
}

// Сдвинуть клип целиком (меняется только at). Не вылезает за 0 и за длину
// композиции; на соседей не налезает — упирается в них
export function moveAudioClip(clips, id, at, timelineLen) {
  const me = clips.find(c => c.id === id)
  if (!me) return clips
  let lo = 0
  let hi = Math.max(0, timelineLen - me.len)
  for (const c of clips) {
    if (c.id === id) continue
    if (c.at + c.len <= me.at) lo = Math.max(lo, c.at + c.len)
    else if (c.at >= me.at + me.len) hi = Math.min(hi, c.at - me.len)
  }
  const next = Math.max(lo, Math.min(hi, at))
  return sortAudioClips(clips.map(c => (c.id === id ? { ...c, at: next } : c)))
}

// Подрезать клип за край. Левый край двигает и at, и from (кусок файла
// начинается позже), правый — только len. Дальше самого файла не растянуть
export function trimAudioClip(clips, id, side, t, fileDuration) {
  const me = clips.find(c => c.id === id)
  if (!me) return clips
  let next
  if (side === 'left') {
    const minAt = Math.max(0, me.at - me.from)   // from не может стать < 0
    const at = Math.max(minAt, Math.min(t, me.at + me.len - MIN_CLIP_S))
    const d = at - me.at
    next = { ...me, at, from: me.from + d, len: me.len - d }
  } else {
    const maxEnd = me.at + (fileDuration - me.from)   // файл кончился
    const end = Math.min(maxEnd, Math.max(t, me.at + MIN_CLIP_S))
    next = { ...me, len: end - me.at }
  }
  // На соседей не налезаем
  for (const c of clips) {
    if (c.id === id) continue
    if (c.at + c.len <= me.at && next.at < c.at + c.len) {
      const d = c.at + c.len - next.at
      next = { ...next, at: next.at + d, from: next.from + d, len: next.len - d }
    }
    if (c.at >= me.at + me.len && next.at + next.len > c.at) next = { ...next, len: c.at - next.at }
  }
  if (next.len < MIN_CLIP_S) return clips
  return clips.map(c => (c.id === id ? next : c))
}

// Копия куска встык за ним (тот же отрезок файла ещё раз — «повтори слово»).
// Не влезает перед соседом — встаёт за последним куском; не влезает в
// композицию — подрезается, а совсем не помещается — ничего не делаем
export function duplicateAudioClip(clips, id, timelineLen) {
  const src = (clips ?? []).find(c => c.id === id)
  if (!src) return clips
  const sorted = sortAudioClips(clips)
  const next = sorted.find(c => c.at >= src.at + src.len)
  let at = src.at + src.len
  if (next && at + src.len > next.at) at = audioClipsEnd(sorted)
  const len = Math.min(src.len, timelineLen - at)
  if (len < MIN_CLIP_S) return clips
  return sortAudioClips([...clips, { id: uid(), at, from: src.from, len }])
}

export function removeAudioClip(clips, id) {
  return (clips ?? []).filter(c => c.id !== id)
}
