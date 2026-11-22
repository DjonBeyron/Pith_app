// Файл-контекст блока таймлайна для комментария в GitHub (кнопка «💬 Комментарий в GitHub» в карточке блока — TimelineBlockComment.jsx): всё, что нужно разработчику, чтобы понять, О ЧЁМ комментарий владельца,
// не открывая экран: какое прохождение, где блок (строка-адрес и время от начала игры), сам блок, что было ДО и что ПОСЛЕ, какие звуки шли в этот момент и рядом (окно ±5 с), сырые события трассы этого окна
// (строки «[scene] {json}» — как в журнале игры), текущие правки монтажа и то же самое коротким JSON. Уходит файлом pithy-timeline-block-<дата>.txt (timelineLog.blockFile) вместе с обычными логами.
// Чистые функции: всё внешнее (время, версия, устройство) приходит аргументами.
import { buildPauses } from './timelinePauses.js'
import { rows as buildRows } from './timelineReport.js'
import { stamp, dur, clock, WHO, RES, DEFAULT_THRESHOLD } from './timelineFormat.js'
import { describeBlock, blockAddr, blockHuman, aroundRows, clipKey, GAP_NAMES } from './timelineBlock.js'
import { sideLine } from './timelinePauseSides.js'

export const NEAR_MS = 5000   // окно «звуки рядом» и сырых событий: ±5 с от блока
export const AROUND_N = 8     // сколько событий хронологии до и после
export const RAW_MAX = 300    // потолок сырых событий в файле (длинный этап — сотни событий)

const two = n => String(n).padStart(2, '0')
const when = ms => { const d = new Date(ms); return Number.isNaN(d.getTime()) || !ms ? '' : `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}` }
const END_WHY = { done: 'договорил', timer: 'договорил (по таймеру)', replaced: 'оборвана следующей репликой', stopped: 'остановлена', pause: 'оборвана паузой игры' }

/** Реплика одной строкой для «звуки рядом»: времена, кто, текст, id, длина звука, сколько сыграло, чем кончилась, озвучена или подпись */
function soundLine(l, m, b) {
  const over = l.t < b.end + 0.5 && l.end > b.t - 0.5, self = l === b.ref
  return `${stamp(l.t).padStart(12)} — ${stamp(l.end)}  ${WHO[l.who] ?? l.who}: «${l.text || l.id}» [${clipKey(m, l)}] звук ${l.ms ? `${Math.round(l.ms)} мс` : '—'}`
    + `${l.played != null ? `, сыграно ${Math.round(l.played)} мс` : ''}, ${l.silent ? `БЕЗ ОЗВУЧКИ — подпись${l.reason ? ` (${l.reason})` : ''}` : 'озвучена'}${l.why ? `, ${END_WHY[l.why] ?? l.why}` : ''}`
    + `${self ? '  ◀ ЭТОТ БЛОК' : over ? '  ◀ звучит в момент блока' : ''}`
}

/** Подробности блока строками «ключ: значение» */
function detailRows(b, r, m) {
  if (b.kind === 'line') return [['кто', WHO[r.who] ?? r.who], ['текст', r.text || r.id], ['id реплики', r.id], ['ключ клипа', clipKey(m, r)], ['длина озвучки (ms из line-start)', r.ms ? `${Math.round(r.ms)} мс` : '—'],
    ['сыграно (played из line-end)', r.played != null ? `${Math.round(r.played)} мс` : '—'], ['отрезок на таймлайне', dur(r.end - r.t)], ['озвучена', r.silent ? `НЕТ — подпись без звука${r.reason ? ` (${r.reason})` : ''}` : 'да'], ['чем кончилась', END_WHY[r.why] ?? r.why ?? '—']]
  if (b.kind === 'stage') return [['sid', r.sid || '—'], ['акт / вид', `${r.act || '—'} / ${r.type || '—'}`], ['плашка', r.title || '—'], ['реплика стадии', r.line || '—'], ['ход кончен', r.out != null ? `${stamp(r.out)} (дальше ${dur(r.end - r.out)} до следующей стадии)` : '—']]
  if (b.kind === 'turn') return [['слово', r.word], ['дорожка', r.lane ?? '—'], ['номер', r.idx ?? '—'], ['исход', RES[r.res] ?? r.res ?? '—'], ['слово принято', r.claimT != null ? `через ${dur(r.ms)} (${stamp(r.claimT)})` : '—'], ['на экране', dur(b.ms)], ...(r.phrase ? [['ход фразы', r.what ?? 'да']] : [])]
  if (b.kind === 'answer') return [['исход', RES[r.late && r.res === 'win' ? 'late' : r.res] ?? r.res], ['слово', r.word || '—'], ['номер', r.idx ?? '—'], ['после появления пилюли', r.ms != null ? dur(r.ms) : '—'], ['окончательный', r.final === false ? 'нет — пилюля ещё едет' : 'да']]
  if (b.kind === 'pause' || b.kind === 'gap') return [['причина', GAP_NAMES[r.kind] ?? r.kind], ['длина', `${dur(b.ms)} (${b.ms} мс)`], ['долгая (игра молчит дольше порога)', r.long ? 'ДА' : 'нет'],
    ...(r.before ? [['перед тишиной', sideLine(r.before)], ['после тишины', sideLine(r.after)]] : []), ...(r.inside?.length ? [['внутри', r.inside.join('; ')]] : [])]
  return [['что', b.text || '—'], ['длина', dur(b.ms)]]
}

/**
 * Контекст блока. sel — { kind, ref }; m — модель прохождения (timelineModel.buildTimeline); run — прохождение (события трассы); entry — запись выбора прохождения (timelineStore.sourceList: rid, src, label);
 * edits — текст списка правок монтажа ('' — правок нет); thr — порог долгой паузы; device / appVersion — для прохождения этого устройства (у записи сервера свои).
 * → { addr, human, head (начало комментария), text (файл), json (объект) } или null.
 */
export function blockContext({ sel, m, run, entry = null, edits = '', thr = DEFAULT_THRESHOLD, device = '', appVersion = '', now = new Date() }) {
  const b0 = describeBlock(sel, m)
  if (!b0 || !m) return null
  const b = { ...b0, ref: sel.ref }, runId = entry?.rid ?? run?.id ?? ''
  const addr = blockAddr(b, runId), human = blockHuman(b)
  const list = buildRows(m, buildPauses(m, thr)), around = aroundRows(list, sel, AROUND_N)
  const from = b.t - NEAR_MS, to = b.end + NEAR_MS
  const sounds = m.lines.filter(l => l.end >= from && l.t <= to)
  const raw = (run?.events ?? []).filter(e => e && Number.isFinite(e.t) && e.t - m.t0 >= from && e.t - m.t0 <= to)
  const srcName = entry?.src === 'server' ? 'сервер (сохранённая игра — живого журнала этой игры на устройстве нет)' : 'это устройство (события есть и в журнале игры)'
  const info = { id: runId, src: entry?.src ?? 'local', device: run?.device || device || '—', appVersion: run?.appVersion || appVersion || '—', at: run?.at ?? null, savedAt: run?.savedAt ?? null, meta: run?.meta ?? {}, events: run?.events?.length ?? 0, dropped: run?.dropped ?? 0 }
  const row = x => `${stamp(x.t).padStart(12)}  ${x.text}`
  const out = [
    '== БЛОК ТАЙМЛАЙНА — контекст комментария ==', addr, human, '',
    '== ПРОХОЖДЕНИЕ ==',
    `id: ${info.id || '—'} · источник: ${srcName}`,
    `устройство: ${info.device} · версия приложения: ${info.appVersion} · старт игры: ${when(info.at) || '—'}${info.savedAt ? ` · сохранено на сервер: ${when(Date.parse(info.savedAt))}` : ''}`,
    `игра: ${Object.entries(info.meta).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${v}`).join(', ') || '—'} · длина ${dur(m.dur)} · событий ${info.events}${info.dropped ? ` (начало вытеснено: ${info.dropped})` : ''}`,
    ...(entry?.label ? [`подпись в списке: ${entry.label}`] : []), '',
    '== БЛОК ==',
    `время от начала игры: ${stamp(b.t)} (${clock(b.t, true)}) — ${stamp(b.end)}, длина ${dur(b.ms)}`,
    `этап: ${b.stage || '—'}${b.sid ? ` [${b.sid}]` : ''}`,
    ...detailRows(b, sel.ref, m).map(([k, v]) => `${k}: ${v}`),
    ...(b.src ? [`событие трассы: [scene] ${JSON.stringify(b.src)}`, `как найти в журнале: строка «[scene]» с "t":${b.src.t} (t трассы = начало прохождения ${m.t0} + время блока)`] : [`как найти в журнале: события «[scene]» с t от ${Math.round(m.t0 + b.t)} до ${Math.round(m.t0 + b.end)}`]), '',
    `== ЧТО БЫЛО ДО (${around.before.length}) ==`, ...(around.before.length ? around.before.map(row) : ['(начало игры)']), '',
    `== ЧТО ПОСЛЕ (${around.after.length}) ==`, ...(around.after.length ? around.after.map(row) : ['(конец игры)']), '',
    `== ЗВУКИ В ЭТОТ МОМЕНТ И РЯДОМ (±${NEAR_MS / 1000} с): ${sounds.length} ==`, ...(sounds.length ? sounds.map(l => soundLine(l, m, b)) : ['(никто не говорил)']), '',
    `== СЫРЫЕ СОБЫТИЯ ТРАССЫ ОКНА (±${NEAR_MS / 1000} с): ${raw.length}${raw.length > RAW_MAX ? `, показаны первые ${RAW_MAX}` : ''} ==`, ...raw.slice(0, RAW_MAX).map(e => `[scene] ${JSON.stringify(e)}`), '',
    '== ПРАВКИ МОНТАЖА ==', edits || '(правок нет)', '',
  ]
  const json = {
    v: 1, addr, human, at: now.toISOString(), run: info,
    block: { kind: b.kind, t: Math.round(b.t), end: Math.round(b.end), ms: Math.round(b.ms), sid: b.sid, stage: b.stage, who: b.who, id: b.id, text: b.text, key: b.kind === 'line' ? clipKey(m, sel.ref) : null, src: b.src },
    before: around.before.map(x => ({ t: Math.round(x.t), kind: x.kind, text: x.text })), after: around.after.map(x => ({ t: Math.round(x.t), kind: x.kind, text: x.text })),
    sounds: sounds.map(l => ({ t: Math.round(l.t), end: Math.round(l.end), who: l.who, id: l.id, key: clipKey(m, l), text: l.text, ms: l.ms || null, played: l.played, why: l.why, silent: !!l.silent, during: l.t < b.end + 0.5 && l.end > b.t - 0.5 })),
    rawEvents: raw.length, hasEdits: !!edits,
  }
  out.push('== JSON ==', JSON.stringify(json))
  return { addr, human, head: `${addr}\n${human}`, text: out.join('\n'), json }
}
