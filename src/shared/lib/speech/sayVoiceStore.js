// Реестр «голосовых» ответов ученика на ВРЕМЯ СЕССИИ урока («Сказать фразу», режим ноды «голосовое с текстом»). Клип — WAV из памяти (voskRecord.js), здесь он получает blob-URL,
// по которому его играет пузырь в чате. ТОЛЬКО оперативная память страницы: ни IndexedDB, ни localStorage, ни сети, ни чекпойнта урока — закрыли урок (размонтировался плеер) — clearAll()
// отзывает все URL, и звук исчезает. Пузырь в чате хранит лишь voiceId (строку); нет клипа (выселен лимитом, отозван шагом назад админа, урок закрыт) — пузырь тихо остаётся «только текст».
// Лимиты: не больше MAX_CLIPS клипов и MAX_BYTES суммарно, при превышении выселяются самые старые. Подписка (subscribe/getVersion) — чтобы пузыри перерисовались при выселении.
export const MAX_CLIPS = 40
export const MAX_BYTES = 25 * 1048576

export function createVoiceStore({
  makeUrl = blob => URL.createObjectURL(blob), freeUrl = url => URL.revokeObjectURL(url), maxClips = MAX_CLIPS, maxBytes = MAX_BYTES,
} = {}) {
  const clips = new Map() // voiceId → { id, url, size, durationMs, peaks }; порядок вставки = порядок выселения
  const subs = new Set()
  let bytes = 0
  let seq = 0
  let ver = 0
  const bump = () => { ver++; subs.forEach(fn => { try { fn() } catch { /* подписчик не должен ломать реестр */ } }) }
  function drop(id) {
    const c = clips.get(id)
    if (!c) return false
    clips.delete(id)
    bytes -= c.size
    try { freeUrl(c.url) } catch { /* URL уже отозван */ }
    return true
  }
  return {
    /** Положить клип. meta: { durationMs, peaks }. Возвращает voiceId либо null (пустой/слишком большой blob, нет blob-URL) */
    put(blob, meta = {}) {
      const size = blob?.size ?? 0
      if (!size || size > maxBytes) return null
      let url
      try { url = makeUrl(blob) } catch { return null }
      while (clips.size && (clips.size >= maxClips || bytes + size > maxBytes)) drop(clips.keys().next().value)
      const id = `sv${++seq}`
      clips.set(id, { id, url, size, durationMs: Math.max(0, Math.round(meta.durationMs || 0)), peaks: Array.isArray(meta.peaks) ? meta.peaks : [] })
      bytes += size
      bump()
      return id
    },
    get: id => clips.get(id) ?? null,
    has: id => clips.has(id),
    /** Освободить один клип (шаг назад админа, отмена отправки) */
    revoke(id) { if (drop(id)) bump() },
    revokeMany(ids) { let any = false; for (const id of ids ?? []) if (id && drop(id)) any = true; if (any) bump() },
    /** Закрытие урока: освободить всё */
    clearAll() { const had = clips.size > 0; [...clips.keys()].forEach(drop); if (had) bump() },
    stats: () => ({ clips: clips.size, bytes }),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
    getVersion: () => ver,
  }
}

/** Единый реестр приложения (один плеер урока за раз) */
export const sayVoices = createVoiceStore()
export const putSayVoice = (blob, meta) => sayVoices.put(blob, meta)
export const getSayVoice = id => sayVoices.get(id)
export const revokeSayVoice = id => sayVoices.revoke(id)
export const revokeSayVoices = ids => sayVoices.revokeMany(ids)
export const clearSayVoices = () => sayVoices.clearAll()
