import { CAT_LINES } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { isMiaLine, MIA_LINES } from '../../pitrace/mia/miaLines.js'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { CODE_TEXT_OF } from '../../rehearsal/rehearsalLines.js'

// Аудит озвучки реплик Пита и Мии: сверка КАТАЛОГА КОДА (CAT_LINES) с тем, что реально сохранено в настройках (app_settings.rotate_cat_lines, сырое значение — до normalizeLines, который прячет разницу).
// Зачем отдельно от таблицы: таблица показывает уже нормализованные реплики, а аудит отвечает на вопрос «что изменилось и почему кнопка «Озвучить недостающие» должна это видеть» — по каждой реплике причина и «было → стало».
// Статусы: ok — файл есть и говорит текущий текст; new — реплики нет в настройках вообще (добавили в код); none — запись есть, файла нет; stale — файл говорит ДРУГОЙ текст (в коде поправили, либо поправили в админке без переозвучки);
// nodur — файл есть, длительности нет (рот и тайминги не работают, переозвучить). Реплики с {word} озвучить нельзя (skip). Лишние записи в настройках (нет в каталоге) — orphans. Чистые функции без React.
export const AUDIT_LABEL = { ok: 'озвучено', new: 'новая реплика, нет в настройках', none: 'нет озвучки', stale: 'текст изменён, озвучка говорит старое', nodur: 'озвучка без длительности', skip: 'с {word}: не озвучивается' }
// Реплики «Встряхни память» (v3.3.356, владелец: «оставим только те, что есть во Встряхни память, остальное — в олд»): гонка (RACE_LINES) + Мия и Пит эпизода (MIA_LINES). Остальное каталога — реплики
// других игр (повтор за диктором, «Мини-игра 2.0», шлифовка): их аудит живёт в разделе «Старое» (OtherLinesAudit.jsx), а блок «Озвучка Пита» их не считает — его кнопки их всё равно не озвучивают
export const RACE_LINE_SET = new Set([...RACE_LINES, ...MIA_LINES].map(l => l.id))
export const raceCatalog = (catalog = CAT_LINES) => catalog.filter(d => RACE_LINE_SET.has(d.id))
export const otherCatalog = (catalog = CAT_LINES) => catalog.filter(d => !RACE_LINE_SET.has(d.id))
export const AUDIT_MISSING = ['new', 'none', 'stale', 'nodur'] // что должна подхватывать кнопка «Озвучить недостающие»

const clean = s => String(s ?? '').trim()

/** Один статус по сырой записи реплики (rec — запись из настроек или undefined) и тексту каталога → { status, reason, was, now } */
export function auditLine(def, rec, codeText = CODE_TEXT_OF[def.id] ?? def.text) {
  const custom = rec?.custom === true && !!clean(rec.text)
  const now = custom ? clean(rec.text) : clean(codeText)
  if (now.includes('{')) return { status: 'skip', reason: AUDIT_LABEL.skip, was: null, now }
  if (!rec || typeof rec !== 'object') return { status: 'new', reason: AUDIT_LABEL.new, was: null, now }
  if (!(typeof rec.url === 'string' && rec.url)) {
    const old = clean(rec.text)
    return { status: 'none', reason: old && old !== now ? `нет озвучки, текст в коде другой (было «${old}»)` : AUDIT_LABEL.none, was: old && old !== now ? old : null, now }
  }
  const voiced = clean(typeof rec.said === 'string' ? rec.said : rec.text) // что говорит файл: said — записывается при каждой озвучке; у старых записей — сохранённый текст
  if (voiced !== now) return { status: 'stale', reason: `${AUDIT_LABEL.stale}: было «${voiced}», стало «${now}»`, was: voiced, now }
  if (!(Number(rec.duration) > 0)) return { status: 'nodur', reason: AUDIT_LABEL.nodur, was: null, now }
  return { status: 'ok', reason: AUDIT_LABEL.ok, was: null, now }
}

/** Полный аудит: raw — сырое значение настроек (с { lines } или без) → { entries: [{ id, who, status, reason, was, now, when }], byId, counts, missing, orphans, mia: { missing } } */
export function auditVoice(raw, catalog = CAT_LINES, all = catalog) { // all — весь каталог: «лишними» (orphans) считаются записи, которых нет нигде, а не только вне catalog
  const src = raw && typeof raw === 'object' ? raw.lines ?? raw : {}
  const entries = catalog.map(d => ({ id: d.id, who: isMiaLine(d.id) ? 'mia' : d.who === 'pit' ? 'pit-mia' : 'pit', when: d.when ?? '', ...auditLine(d, src?.[d.id]) }))
  const counts = { ok: 0, new: 0, none: 0, stale: 0, nodur: 0, skip: 0 }
  for (const e of entries) counts[e.status] += 1
  const known = new Set(all.map(d => d.id))
  const orphans = Object.keys(src ?? {}).filter(k => !known.has(k) && src[k] && typeof src[k] === 'object' && src[k].url)
  const missing = entries.filter(e => AUDIT_MISSING.includes(e.status))
  return { entries, byId: Object.fromEntries(entries.map(e => [e.id, e])), counts, missing, orphans, mia: { missing: missing.filter(e => e.who === 'mia') } }
}

/** Одна строка-итог: «Не озвучено 5: 2 новых, 1 текст изменён …» (null — всё озвучено) */
export function auditSummary(a) {
  if (!a.missing.length) return null
  const parts = [['new', 'новых'], ['stale', 'с изменённым текстом'], ['none', 'без озвучки'], ['nodur', 'без длительности']].filter(([k]) => a.counts[k]).map(([k, w]) => `${a.counts[k]} ${w}`)
  return `Нужно озвучить ${a.missing.length}: ${parts.join(', ')}`
}
