// Выгрузка отладки «Повтори за диктором» одним файлом pithy-dictor-debug-<дата-время>.json: журнал (wordLaneDebug.dump) + запись микрофона в base64 + что ученик сам сказал (userSaid).
// Тяжёлое (base64 аудио) готовится заранее, пока ученик читает перевод (prepareAudio), а на нажатии остаётся только склеить JSON и сразу отдать файл: iOS Safari даёт «Поделиться»
// лишь пока не прошло слишком много времени после касания, а долгий await до share() его отбирает.
// Как файл попадает к человеку (saveDebugFile → что получилось): 'download' — обычное скачивание (<a download>); 'share' — системное «Поделиться» (iOS Safari, где download ненадёжен);
// 'tab' — blob открыт в новой вкладке (сохранить оттуда); 'cancelled' — «Поделиться» закрыто; 'failed' — ничего не вышло.
export const FILE_PREFIX = 'pithy-dictor-debug-'
export const REVOKE_AFTER_MS = 60000

const pad = n => String(n).padStart(2, '0')

/** pithy-dictor-debug-2026-10-29_14-05-33.json (локальное время телефона) */
export function debugFileName(d = new Date()) {
  return `${FILE_PREFIX}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`
}

/** Blob → base64 (без префикса data:). FileReader, если есть; иначе arrayBuffer кусками (btoa не любит длинные строки) */
export async function blobToBase64(blob) {
  if (typeof FileReader === 'function') {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
      r.onerror = () => reject(r.error || new Error('FileReader'))
      r.readAsDataURL(blob)
    })
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Части записи рекордера → [{ mime, base64, startedAtMs }]; нет записи — [] */
export async function prepareAudio(recorder) {
  const parts = recorder?.parts?.() ?? []
  const out = []
  for (const p of parts) {
    try { out.push({ mime: p.mime, base64: await blobToBase64(p.blob), startedAtMs: p.startedAtMs }) } catch { /* эту часть не прочитали — остальные уйдут */ }
  }
  return out
}

/**
 * Содержимое файла: журнал + audio (первая часть записи) и audioMore (остальные части, если распознаватель переоткрывал микрофон между заходами). audioParts — сколько частей всего.
 * userSaid — «что я говорил» одной строкой (необязательно).
 */
export function buildDebugFile({ log, audio = [], userSaid = '', now = new Date() }) {
  const dump = log.dump() ?? {}
  const body = { ...dump, userSaid: String(userSaid ?? '').trim(), exportedAt: now.toISOString(), audioParts: audio.length, audio: audio[0] ?? null, ...(audio.length > 1 ? { audioMore: audio.slice(1) } : {}) }
  const json = JSON.stringify(body)
  const name = debugFileName(now)
  const type = 'application/json'
  const blob = typeof File === 'function' ? new File([json], name, { type }) : new Blob([json], { type })
  return { name, json, blob, size: json.length }
}

/** Что сказать человеку про итог saveDebugFile (общее для кнопки в финале и HUD игры) */
export const SAVE_HOW = {
  download: 'Файл скачан',
  share: 'Файл отправлен через «Поделиться»',
  tab: 'Файл открыт в новой вкладке — сохрани его оттуда («Поделиться» → «Сохранить в Файлы»)',
  cancelled: 'Отправка отменена',
  failed: 'Не получилось сохранить файл',
}

const isIos = nav => /iPhone|iPad|iPod/.test(String(nav?.userAgent ?? '')) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1)

/** Отдать файл: iOS — «Поделиться» (иначе новая вкладка), остальные — скачивание. Возвращает 'download' | 'share' | 'tab' | 'cancelled' | 'failed' */
export async function saveDebugFile(file, { doc = globalThis.document, nav = globalThis.navigator, win = globalThis.window, urlApi = globalThis.URL, setTimer = setTimeout } = {}) {
  const url = () => urlApi.createObjectURL(file.blob)
  const later = u => { setTimer(() => { try { urlApi.revokeObjectURL(u) } catch { /* уже освобождён */ } }, REVOKE_AFTER_MS) }
  const openTab = () => {
    try { const u = url(); later(u); return win.open(u, '_blank') ? 'tab' : 'failed' } catch { return 'failed' }
  }
  const download = () => {
    try {
      const u = url()
      const a = doc.createElement('a')
      a.href = u; a.download = file.name; a.style.display = 'none'
      doc.body.appendChild(a); a.click(); a.remove()
      later(u)
      return 'download'
    } catch { return null }
  }
  if (isIos(nav)) {
    try {
      if (nav.canShare?.({ files: [file.blob] }) && nav.share) { await nav.share({ files: [file.blob], title: file.name }); return 'share' }
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled' // человек сам закрыл «Поделиться»
    }
    return openTab()
  }
  return download() ?? openTab()
}
