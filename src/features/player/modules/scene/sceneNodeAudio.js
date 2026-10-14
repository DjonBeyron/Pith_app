// Озвучка реплик ноды `scene` из прогрева урока. usePlayerPreload ставит
// audioUrl реплик в очередь файлами ноды (preloadQueue.nodeDownloads, ключ —
// сама ссылка), а withBlobs (usePlayerFiles.js) отдаёт их модулю в lessonFiles
// записями { id: url, blobUrl, evicted, error }. Здесь из них собирается
// audioSrcOf(url) → blob-URL для SceneRenderer: реплика играет из памяти, без
// сети; нет blob (ещё качается / ошибка / выгружен) → null → прямая ссылка
// (или кэш подкачки сцен). Без записей — null: режиссёр ничего не ищет.
export function sceneAudioSrcOf(lessonFiles) {
  const map = new Map()
  for (const f of lessonFiles ?? []) {
    if (f?.blobUrl && !f.evicted && !f.error && /^https?:\/\//.test(String(f.id))) map.set(f.id, f.blobUrl)
  }
  return map.size ? url => map.get(url) ?? null : null
}
