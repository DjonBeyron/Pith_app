// Бюджет памяти blob-файлов озвучки сцен (preloadEvict.js). Сцену нельзя класть в
// EVICT_TYPES: там вытеснение считает ФАЙЛЫ (буфер в нодах-голосовых/видео), а у
// сцены их по 6–12 мелких mp3 на ноду — они выталкивали бы из буфера настоящие
// голосовые и ролики. Поэтому у сцен свой счёт — в БАЙТАХ, по показанным нодам.
// Типичная реплика ElevenLabs 100–200 КБ → нода из 8 реплик ≈ 1–1,5 МБ, т.е. бюджет
// держит ~4–5 последних сцен; старше — прямая ссылка/кэш подкачки (sceneAudioCache.js),
// сцена в истории не звучит вовсе.
export const SCENE_BLOB_BUDGET = 6 * 1024 * 1024

// files: [{ id, size, rank, nodeId }] — показанные scene-файлы с blob; rank — место
// ноды в ленте (меньше = старше). protectNodeId — нода только что догруженного файла,
// её не трогаем (играет/сейчас будет играть); самую новую показанную сцену — тоже.
// Возвращает id файлов к выгрузке: самые старые по показу, пока сумма > budget
export function pickSceneEvictions(files, { budget = SCENE_BLOB_BUDGET, protectNodeId = null } = {}) {
  let total = files.reduce((s, f) => s + (f.size || 0), 0)
  if (total <= budget) return []
  const newest = files.reduce((m, f) => Math.max(m, f.rank), -Infinity)
  const out = []
  const order = [...files].sort((a, b) => a.rank - b.rank)
  for (const f of order) {
    if (total <= budget) break
    if (f.nodeId === protectNodeId || f.rank === newest) continue
    out.push(f.id)
    total -= f.size || 0
  }
  return out
}
