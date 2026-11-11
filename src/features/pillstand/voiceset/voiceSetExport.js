// Архив «Записи набора» (v3.3.188, CONCEPT_VOICESET.md): клипы из хранилища + manifest.json → ZIP (voiceSetZip.js), больше 20 МБ — частями (voiceSetManifest.splitParts). Архивы собираются
// ЗАРАНЕЕ, по кнопке «Собрать архив»: «Поделиться» на iPhone открывается только прямо из нажатия, а чтение IndexedDB — это ожидание (тот же приём, что у отладочной выгрузки игры,
// wordLaneDebugExport.js). Отдаёт файл saveDebugFile: iPhone — лист «Поделиться» («Сохранить в Файлы»), иначе новая вкладка; компьютер — скачивание. Набор после выгрузки остаётся в хранилище.
import { zipStore } from './voiceSetZip.js'
import { splitParts, buildManifest, archiveName, PART_MAX } from './voiceSetManifest.js'

const asFile = (parts, name) => (typeof File === 'function' ? new File(parts, name, { type: 'application/zip' }) : new Blob(parts, { type: 'application/zip' }))

/** → [{ name, blob, size, count, part, parts, missing }] — готовые ZIP по частям; клип без звука в хранилище в архив не идёт (missing — их файлы) */
export async function buildArchives({ store, meta, clips, now = new Date(), max = PART_MAX }) {
  const parts = splitParts(clips, max), out = []
  for (let p = 0; p < parts.length; p++) {
    const files = [], have = [], missing = []
    for (const c of parts[p]) {
      const a = await store.getAudio(c.i)
      if (!a) { missing.push(c.file); continue }
      have.push(c); files.push({ name: c.file, data: new Uint8Array(a) })
    }
    const manifest = { ...buildManifest({ meta, clips: have, part: p + 1, parts: parts.length, total: clips.length, now }), ...(missing.length ? { missing } : {}) }
    files.unshift({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 1)) })
    const name = archiveName(now, p + 1, parts.length), blob = asFile(zipStore(files, { date: now }), name)
    out.push({ name, blob, size: blob.size, count: have.length, part: p + 1, parts: parts.length, missing })
  }
  return out
}

export const mb = n => `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1).replace('.', ',')} МБ`
