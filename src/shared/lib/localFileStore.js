// IndexedDB-backed storage for large binary data (voice, photo, video data URLs).
// Replaces localStorage/sessionStorage which overflow at ~5MB.
// IndexedDB quota: hundreds of MB — no practical limit for this use case.

const DB_NAME = 'pith_local_files'
const STORE   = 'files'
let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE)
    req.onsuccess  = e => { _db = e.target.result; resolve(_db) }
    req.onerror    = e => reject(e.target.error)
  })
}

export async function lfSave(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}

export async function lfGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = e => resolve(e.target.result ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}

// Returns a map of ALL stored key→value pairs
export async function lfGetAll() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx     = db.transaction(STORE, 'readonly')
    const result = {}
    const req    = tx.objectStore(STORE).openCursor()
    req.onsuccess = e => {
      const cursor = e.target.result
      if (cursor) { result[cursor.key] = cursor.value; cursor.continue() }
      else resolve(result)
    }
    req.onerror = e => reject(e.target.error)
  })
}

export async function lfDelete(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}
