// Озвучка реплики заранее записанным файлом (audioUrl, задел под ElevenLabs)
// через HTMLAudio — не WebAudio: на iOS элемент, стартовавший в жесте, дальше
// играет сам (см. sceneAudioUnlock.js). Границы слов — из wordTimings
// [{ start, end }] в секундах: лёгкий rAF-опрос currentTime (только пока
// реплика звучит) дёргает onWord → рот. Без wordTimings — рот по таймеру.
// Ошибка загрузки/запрета автозапуска → onFail(), вызывающий код уходит в
// запасной вариант (speakFallback).

// Индекс первого слова, начинающегося не позже t, начиная с from. Чистая
// функция для теста: сколько слов «прошло» за время t
export function wordsPassed(timings, t, from = 0) {
  let i = from
  while (i < timings.length && timings[i].start <= t) i += 1
  return i
}

export function playLineAudio(line, audio, {
  onWord, onEnd, onFail, onMode, raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame,
} = {}) {
  if (!audio || !line?.audioUrl) { onFail?.(); return () => {} }
  const timings = Array.isArray(line.wordTimings) ? line.wordTimings : null
  let done = false
  let frame = 0
  let wordIdx = 0
  let timer = null

  function finish(fail) {
    if (done) return
    done = true
    if (frame) caf(frame)
    if (timer) clearInterval(timer)
    audio.onended = audio.onerror = null
    if (fail) onFail?.()
    else onEnd?.()
  }

  function poll() {
    if (done) return
    const next = wordsPassed(timings, audio.currentTime, wordIdx)
    if (next > wordIdx) { wordIdx = next; onWord?.() }
    frame = raf(poll)
  }

  audio.onended = () => finish(false)
  audio.onerror = () => finish(true)
  try {
    if (audio.src !== line.audioUrl) audio.src = line.audioUrl
    audio.currentTime = 0
  } catch { /* до загрузки метаданных currentTime может бросить — не критично */ }

  const p = audio.play()
  onMode?.('audio')
  if (timings?.length) frame = raf(poll)
  else {
    // Нет таймингов — рот примерно по слогам
    const words = (line.text ?? '').split(/\s+/).filter(Boolean).length || 1
    timer = setInterval(() => onWord?.(), Math.max(160, Math.floor(((line.text?.length ?? 0) * 65) / (words + 1))))
  }
  if (p?.catch) p.catch(() => finish(true))

  return () => {
    if (done) return
    done = true
    if (frame) caf(frame)
    if (timer) clearInterval(timer)
    audio.onended = audio.onerror = null
    try { audio.pause() } catch { /* ignore */ }
  }
}
