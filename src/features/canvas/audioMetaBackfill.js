// Чистая часть досчёта меты голосовых (useAudioMetaBackfill.js): какие ноды
// нуждаются в волне/длительности и откуда взять их файл. Без React и DOM —
// покрыто тестом audioMetaBackfill.test.js.
//
// Мета (`waveformData` 0..255 по 30 кадров/с + `duration` в секундах) нужна
// плееру, чтобы спектр и таймер были готовы с первого кадра без
// decodeAudioData на устройстве. Пишут её NodeAudioPicker/NodeAudioTts при
// выборе/генерации, а у уроков из импорта или с подложенными файлами её нет.

// Только «Голосовое»: у voice_record файл — запись ученика, у остальных типов
// волна не рисуется
export const BACKFILL_TYPES = new Set(['audio'])

function isValidUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))
}

export function hasWaveform(data) {
  return Array.isArray(data?.waveformData) && data.waveformData.length > 0
}

export function hasDuration(data) {
  const d = data?.duration
  return typeof d === 'number' && Number.isFinite(d) && d > 0
}

export function hasAudioMeta(data) {
  return hasWaveform(data) && hasDuration(data)
}

// Откуда плеер берёт файл ноды (см. player/preloadQueue.nodeDownloads):
// r2Url из списка файлов урока, иначе r2Url, вписанный в ноду при прошлом
// сохранении. Локальный (ещё не загруженный) файл отдаём как localFile —
// его считаем из blob напрямую, без сети
export function resolveAudioSource(node, files) {
  const data   = node.typeData?.[node.type]
  const fileId = data?.file_id
  if (!fileId) return null
  const f = files.find(fl => fl.id === fileId) ?? null
  if (f?.localFile) return { fileId, url: null, localFile: f.localFile }
  const url = f?.r2Url ?? data?.r2Url ?? null
  return isValidUrl(url) ? { fileId, url, localFile: null } : null
}

// Список работ для досчёта: [{ nodeId, seq, fileId, url, localFile }] в
// порядке номеров нод. Ноды без файла, без доступного источника и с уже
// полной метой — не попадают
export function nodesNeedingAudioMeta(nodes, files = []) {
  const out = []
  for (const n of nodes ?? []) {
    if (!BACKFILL_TYPES.has(n.type)) continue
    const data = n.typeData?.[n.type]
    if (hasAudioMeta(data)) continue
    const src = resolveAudioSource(n, files)
    if (!src) continue
    out.push({ nodeId: n.id, seq: n.seq ?? 0, ...src })
  }
  return out.sort((a, b) => a.seq - b.seq)
}

// Что дописать в typeData.audio: только недостающее, уже имеющееся не трогаем
// (например, длительность могла быть, а волны — нет)
export function buildAudioMetaPatch(data, { waveformData, duration }) {
  const patch = {}
  if (!hasWaveform(data) && Array.isArray(waveformData) && waveformData.length) patch.waveformData = waveformData
  if (!hasDuration(data) && typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    patch.duration = duration
  }
  return patch
}
