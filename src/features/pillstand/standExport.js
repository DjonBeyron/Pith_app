// Выгрузка стенда пилюль (CONCEPT_PILLSTAND.md): «⬇ Трасса» — JSON (метаданные: версия, устройство, режим, язык, сид, цели; события трассы; кадры записи; формат и смещение звука), звук — отдельным файлом;
// оба через saveDebugFile (wordLaneDebugExport.js: на iPhone — «Поделиться» или новая вкладка). «Скопировать сводку» — буфер обмена (запасной путь — скрытое поле и execCommand).
import { saveDebugFile } from '../player/modules/rotate-phone/wordLaneDebugExport.js'

const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`
const ext = type => (/mp4|aac|m4a/.test(type ?? '') ? 'm4a' : /ogg/.test(type ?? '') ? 'ogg' : 'webm')

/** Файл трассы: { name, blob, json, size } */
export function traceFile({ meta, events, frames = [], audio = null, now = new Date() }) {
  const name = `pithy-pillstand-${stamp(now)}.json`
  const body = { kind: 'pithy-pillstand', v: 1, meta: { ...meta, exportedAt: now.toISOString() }, targets: events.filter(e => e.k === 'target'), events, frames, audio: audio ? { type: audio.type, startMs: audio.startMs, file: name.replace(/\.json$/, `.${ext(audio.type)}`) } : null }
  const json = JSON.stringify(body)
  return { name, json, blob: new Blob([json], { type: 'application/json' }), size: json.length }
}

/** Файл звука записи или null */
export const audioFile = (audio, traceName) => (audio?.blob ? { name: traceName.replace(/\.json$/, `.${ext(audio.type)}`), blob: audio.blob, size: audio.blob.size } : null)

/** Отдать трассу и (если есть) звук: → итог saveDebugFile трассы */
export async function saveTrace(args, save = saveDebugFile) {
  const f = traceFile(args)
  const how = await save(f)
  const a = audioFile(args.audio, f.name)
  if (a && how !== 'cancelled') await save(a)
  return { how, name: f.name, size: f.size, audio: a?.name ?? null }
}

/** Текст в буфер обмена: → true / false */
export async function copyText(text, { nav = globalThis.navigator, doc = globalThis.document } = {}) {
  try { await nav.clipboard.writeText(text); return true } catch { /* нет доступа — запасной путь */ }
  try {
    const ta = doc.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    doc.body.appendChild(ta); ta.select(); const ok = doc.execCommand('copy'); ta.remove()
    return !!ok
  } catch { return false }
}
