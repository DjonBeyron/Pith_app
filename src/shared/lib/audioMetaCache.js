// Кэш меты голосовых (длительность + волна) по id файла — localStorage.
//
// Волна и длительность — свойство файла, а считаются они на устройстве после
// скачивания (decodeAudioData, секунды на телефоне). Если у ноды мета не
// сохранена (старые уроки, импорт из черновика), первый показ ждёт расчёта;
// повторный — нет: прогрев и пузырь берут отсюда. Запись маленькая (~30
// чисел на секунду звука), держим не больше MAX записей, старые вытесняются.
const KEY = 'pithy_audio_meta_v1'
const MAX = 150

let mem = null // { [fileId]: { d, w, t } } — t: время записи, для вытеснения

function load() {
  if (mem) return mem
  try {
    mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch {
    mem = {}
  }
  return mem
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem))
  } catch {
    // переполнение/приватный режим — кэш просто не сохранится
  }
}

export function getAudioMeta(fileId) {
  if (!fileId) return null
  const e = load()[fileId]
  if (!e) return null
  return { duration: e.d ?? null, waveformData: Array.isArray(e.w) && e.w.length ? e.w : null }
}

export function setAudioMeta(fileId, { duration, waveformData }) {
  if (!fileId || (!duration && !waveformData?.length)) return
  const store = load()
  store[fileId] = { d: duration ?? null, w: waveformData ?? null, t: Date.now() }
  const ids = Object.keys(store)
  if (ids.length > MAX) {
    ids.sort((a, b) => (store[a].t ?? 0) - (store[b].t ?? 0))
    for (const id of ids.slice(0, ids.length - MAX)) delete store[id]
  }
  save()
}
