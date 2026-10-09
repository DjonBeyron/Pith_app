// Заменяемый «источник уровня голоса» для эквалайзера круга-микрофона («Сказать фразу»): подписка → значение 0..1 КАЖДЫЙ КАДР.
// Интерфейс: { subscribe(listener) → unsubscribe }, listener(level, t) зовётся из ОДНОГО общего rAF-цикла (пока есть подписчики; без подписчиков цикла нет),
// t — метка кадра rAF (мс, шкала performance.now — та же, что у событий распознавания). Потребитель (useSayWaves) ничего не знает о том, откуда уровень:
//  • системное распознавание (webkitSpeechRecognition) — сейчас: read = sayRealLevel.levelSource(voice, real).ringLevel — синтетический уровень по событиям
//    распознавания (sayVoiceLevel.js, без второго getUserMedia: он ломает запись на iPhone) или, по админскому флагу, реальный RMS (sayRealLevel.js);
//  • Vosk (отдельный этап) — ТОЧКА ПОДКЛЮЧЕНИЯ: createLevelSource(t => levelFromRms(rmsOf(bytes))), где bytes — getByteTimeDomainData анализатора, который Vosk
//    ДЕРЖИТ САМ на своём аудиопотоке (микрофон один, второго захвата нет). Уровень реальный и приходит с первого кадра, без задержки событий.
// Функция read обязана быть дешёвой (вызывается 60 раз в секунду) и не бросать.
const defaultRaf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : null
const defaultCaf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : null

/** read(t) → 0..1. raf/caf подменяются в тестах */
export function createLevelSource(read, { raf = defaultRaf, caf = defaultCaf } = {}) {
  const listeners = new Set()
  let id = 0
  const tick = t => {
    let level = 0
    try { level = Number(read(t)) || 0 } catch { level = 0 }
    level = level > 1 ? 1 : level > 0 ? level : 0
    for (const fn of [...listeners]) fn(level, t)
    id = listeners.size ? raf(tick) : 0
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!id && raf) id = raf(tick)
      return () => {
        listeners.delete(listener)
        if (!listeners.size && id) { caf?.(id); id = 0 }
      }
    },
    /** Сколько подписчиков (для тестов и диагностики) */
    size: () => listeners.size,
  }
}
