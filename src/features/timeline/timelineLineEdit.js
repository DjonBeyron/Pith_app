// Реплика Пита / Мии на «Таймлайне игры»: статус озвучки для карточки, метки на клипе и списка «Нужно озвучить». Статус НЕ считается здесь заново — он берётся из того же аудита, что у таблицы «Озвучка Пита»
// (admin/speech/voiceAudit.auditVoice: сырые настройки rotate_cat_lines против каталога реплик; приходит готовой картой audit — { [id]: { status, reason, was, now, when } }), здесь только слова и цвет:
//   🟢 ok — файл есть и говорит текущий текст; 🔴 stale — текст изменён, звук старый (игра такую озвучку не играет, идёт подпись); 🔴 nodur — звук без длительности;
//   ⚪ none / new — озвучки нет (подпись); skip — реплика с {word}, не озвучивается.
// Разметка рта (👄): у озвучки ElevenLabs тайминги слов приходят вместе с файлом; свой файл размечается в браузере (shared/lib/vosk/voskAlign.js) — статус читается из самих таймингов реплики
// (метки слов a, voskAlignFill.alignInfo), поэтому переживает перезагрузку.
// Чистые функции без React.
import { alignInfo, alignLine } from '../../shared/lib/vosk/voskAlignFill.js'
export const MARK = { ok: 'green', stale: 'red', nodur: 'red', none: 'white', new: 'white', skip: 'white' }
export const TODO = ['stale', 'nodur', 'none', 'new'] // что попадает в «Нужно озвучить» (то же, что voiceAudit.AUDIT_MISSING)
const LABEL = {
  ok: '🟢 озвучено', stale: '🔴 нужно озвучить: текст изменён, звук старый', nodur: '🔴 нужно озвучить: звук без длительности',
  none: '⚪ без озвучки (подпись)', new: '⚪ без озвучки (подпись)', skip: '⚪ не озвучивается: в тексте подставляется слово',
}
const ORDER = { stale: 0, nodur: 1, none: 2, new: 3 }

export const isSpeaker = l => !!l && (l.who === 'pit' || l.who === 'mia')

/** Реплика модели + аудит → { known, status, mark ('green' | 'red' | 'white'), label, now (текст в настройках сейчас), was (что говорит старый файл), when (где звучит в игре), differs (в этой игре звучал другой текст) } */
export function lineVoiceState(line, audit) {
  const a = isSpeaker(line) ? audit?.[line.id] : null
  if (!a) return { known: false, status: null, mark: null, label: '', now: '', was: null, when: '', differs: false }
  const now = a.now ?? '', said = String(line.text ?? '').trim()
  return { known: true, status: a.status, mark: MARK[a.status] ?? null, label: LABEL[a.status] ?? a.status, now, was: a.was ?? null, when: a.when ?? '', differs: !!said && !!now && said !== now, dictor: a.dictor ?? '', tone: a.tone ?? null, toneNote: a.toneNote ?? '' } // dictor / tone — интонация (voiceAudit: что уйдёт диктору; 'redo' — нужно переозвучить, 'can' — можно)
}

/** Метки для клипов: { [id реплики]: 'red' | 'white' } — только то, что нужно озвучить (зелёные клипы не помечаются) */
export function voiceMarks(m, audit) {
  const out = {}
  for (const l of m?.lines ?? []) { const s = isSpeaker(l) ? audit?.[l.id]?.status : null; if (s && TODO.includes(s)) out[l.id] = MARK[s] }
  return out
}

/** Список «Нужно озвучить»: реплики текущих настроек, которые встречаются в этой игре и которым нужна озвучка — [{ id, who, status, mark, label, now, line (первое появление в игре), n (сколько раз звучит) }], сначала красные */
export function voiceTodo(m, audit) {
  const by = new Map()
  for (const l of m?.lines ?? []) {
    if (!isSpeaker(l)) continue
    const a = audit?.[l.id]
    if (!a || !TODO.includes(a.status)) continue
    const e = by.get(l.id)
    if (e) e.n += 1; else by.set(l.id, { id: l.id, who: l.who, status: a.status, mark: MARK[a.status], label: LABEL[a.status], now: a.now ?? '', line: l, n: 1 })
  }
  return [...by.values()].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.line.t - b.line.t)
}

/** Текст ошибки записи для человека: отказ по правам (RLS) называется прямо */
export function saveError(e) {
  const t = String(e?.message ?? e ?? 'ошибка')
  return /не подтвердил запись|row-level security|permission denied|not authorized|JWT/i.test(t) ? `Не сохранилось: запись в настройки реплик проходит только у админа (${t}). Текст в поле остался — ничего не потеряно.` : `Не сохранилось: ${t}. Текст в поле остался — ничего не потеряно.`
}

/** Запись реплики из настроек → статус разметки рта для карточки: { text, kind ('ok' | 'approx' | 'none'), redo (есть смысл «разметить заново») }; файла озвучки нет → null */
export function mouthState(rec) {
  if (!rec?.url) return null
  const i = alignInfo(rec.words)
  if (!i.has) return { text: '👄 разметки нет', kind: 'none', redo: true }
  if (!i.own) return { text: '👄 рот размечен (озвучка ElevenLabs)', kind: 'ok', redo: false }
  return { text: `👄 ${alignLine(i)}`, kind: i.method === 'vosk' || (i.method === 'vosk+fill' && !i.approx) ? 'ok' : 'approx', redo: i.method !== 'vosk' }
}

/** Итог только что прошедшей разметки (voskAlign.alignAudio) → фраза для сообщения «готово»; разметки не было → '' */
export function mouthDone(r) {
  if (!r) return ''
  if (!r.words?.length) return `👄 рот не размечен (идёт по тексту)${r.notes?.length ? `: ${r.notes.join('; ')}` : ''}`
  const extra = (r.notes ?? []).filter(n => !/расставлены по соседям/.test(n))
  return `👄 ${alignLine(r)}${r.approx && r.method !== 'vosk+fill' ? ' (приблизительно)' : ''}${extra.length ? ` — ${extra.join('; ')}` : ''}`
}
