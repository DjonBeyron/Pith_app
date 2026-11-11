// Хранилище «Записи набора» (v3.3.188, CONCEPT_VOICESET.md): клипы сразу пишутся в IndexedDB — перезагрузка страницы, звонок или закрытая вкладка набор не теряют. База pithy_voiceset_v1:
// 'meta' (одна запись 'set': настройки, подпись сценария, устройство, пропущенные), 'clips' (запись клипа для манифеста, ключ — номер задания i), 'audio' (байты WAV, ключ i; ArrayBuffer, а не
// Blob — Blob в IndexedDB у Safari исторически ненадёжен). Клип и его звук пишутся одной транзакцией. Нет IndexedDB (приватный режим) — память страницы: набор живёт до перезагрузки (persistent: false).
// Набор в тестовой базе — только устройство владельца: в репозиторий и на сервер звук не уходит.
export const DB_NAME = 'pithy_voiceset_v1'
const STORES = ['meta', 'clips', 'audio']

const done = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error ?? new Error('IndexedDB')) })
const finished = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('IndexedDB')); tx.onabort = () => reject(tx.error ?? new Error('IndexedDB: транзакция прервана')) })

/** Хранилище в памяти (тесты, приватный режим): тот же интерфейс */
export function createMemoryStore() {
  let meta = null
  const clips = new Map(), audio = new Map()
  return {
    persistent: false,
    async load() { return meta ? { meta, clips: [...clips.values()].sort((a, b) => a.i - b.i) } : null },
    async saveMeta(m) { meta = m },
    async putClip(clip, bytes) { clips.set(clip.i, clip); audio.set(clip.i, bytes) },
    async dropClip(i) { clips.delete(i); audio.delete(i) },
    async getAudio(i) { return audio.get(i) ?? null },
    async clear() { meta = null; clips.clear(); audio.clear() },
  }
}

function openDb(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1)
    req.onupgradeneeded = () => { const db = req.result; for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB не открылась'))
    req.onblocked = () => reject(new Error('IndexedDB занята другой вкладкой'))
  })
}

/** Хранилище набора: IndexedDB, а если её нет или она не открылась — память страницы */
export async function openVoiceSetStore(idb = globalThis.indexedDB) {
  let db = null
  try { if (idb?.open) db = await openDb(idb) } catch { db = null }
  if (!db) return createMemoryStore()
  const tx = (names, mode = 'readonly') => db.transaction(names, mode)
  return {
    persistent: true,
    async load() {
      const t = tx(['meta', 'clips']), meta = await done(t.objectStore('meta').get('set'))
      if (!meta) return null
      return { meta, clips: (await done(t.objectStore('clips').getAll())).sort((a, b) => a.i - b.i) }
    },
    async saveMeta(m) { const t = tx(['meta'], 'readwrite'); t.objectStore('meta').put(m, 'set'); await finished(t) },
    async putClip(clip, bytes) { const t = tx(['clips', 'audio'], 'readwrite'); t.objectStore('clips').put(clip, clip.i); t.objectStore('audio').put(bytes, clip.i); await finished(t) },
    async dropClip(i) { const t = tx(['clips', 'audio'], 'readwrite'); t.objectStore('clips').delete(i); t.objectStore('audio').delete(i); await finished(t) },
    async getAudio(i) { return (await done(tx(['audio']).objectStore('audio').get(i))) ?? null },
    async clear() { const t = tx(STORES, 'readwrite'); for (const s of STORES) t.objectStore(s).clear(); await finished(t) },
  }
}

/** Что с начатым набором: { done, total, skipped, next (номер первого незаписанного задания; null — всё записано), bytes } */
export function resumeInfo(plan, clips = [], skipped = []) {
  const have = new Set(clips.map(c => c.i)), skip = new Set(skipped)
  const next = plan.find(it => !have.has(it.i) && !skip.has(it.i))
  return { done: clips.filter(c => c.i < plan.length).length, total: plan.length, skipped: skip.size, next: next ? next.i : null, bytes: clips.reduce((s, c) => s + (c.bytes ?? 0), 0) }
}
