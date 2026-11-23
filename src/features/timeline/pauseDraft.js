// Черновик настроек пауз на экране таймлайна (CONCEPT_TIMELINE.md, «Шаг 2 — экран»): владелец меняет значения, они копятся черновиком (с отменой и возвратом, в localStorage — закрытие экрана его не теряет),
// а потом применяются одним из двух способов: «📱 попробовать на этом устройстве» (слой device реестра пауз — только здесь) или «🌍 применить для всех игроков» (сервер). Игра от черновика не меняется.
// Черновик — { ключ: мс }: только отличия от умолчаний («чего хочу»); null — черновика нет, на экране то, что действует сейчас (сервер, поверх него это устройство).
// Чистые функции + два действия с подставляемым api: { readServer() → { ok, value, error }, saveServer(pauses) → { ok, error }, readDevice() → { pauses } | null, saveDevice(obj) → { ok } }.
import { SCENE_PAUSES, pauseInfo, validatePauses, PAUSE_SOURCE_NAMES } from '../../shared/lib/scenePauses.js'
import { hPush, hUndo, hRedo } from './montage/montageHistory.js'
import { sec as dur } from './montage/montageEditsText.js'

export const PAUSE_DRAFT_KEY = 'pithy.timeline.pauseDraft.v1'
export const MIGRATION_NOTE = 'у игроков подействует только после обновления базы (миграция scene_pauses_public_key)'
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
const sorted = o => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)))
const clean = o => Object.fromEntries(Object.entries(validatePauses(o ?? {}).pauses).filter(([k, v]) => v !== pauseInfo(k).def))

/** Что действует сейчас: сервер, поверх него это устройство → { values: { ключ: мс } (все 13), from: { ключ: 'server' | 'device' }, overrides: только отличия от умолчаний } */
export function effective(server, device) {
  const values = {}, from = {}
  for (const p of SCENE_PAUSES) {
    values[p.key] = p.def
    for (const [name, layer] of [['server', server], ['device', device]]) if (layer && typeof layer[p.key] === 'number') { values[p.key] = layer[p.key]; if (layer[p.key] !== p.def) from[p.key] = name; else delete from[p.key] }
  }
  return { values, from, overrides: clean(values) }
}

/** Значение настройки в черновике (draft = null — действующее) */
export const draftValue = (draft, eff, key) => (draft ? draft[key] ?? pauseInfo(key).def : eff.values[key])
/** Откуда значение словами: «по умолчанию» / «это устройство» / «сервер» / «черновик» */
export const sourceName = (draft, eff, key) => (draft && draftValue(draft, eff, key) !== eff.values[key] ? 'черновик — ещё не применён' : eff.from[key] ? PAUSE_SOURCE_NAMES[eff.from[key]] : 'по умолчанию')

/** Поставить настройку key в ms: → { draft } или { error } (значение вне пределов не принимается — причина словами). Шаг — к ближайшим 50 мс */
export function setDraft(draft, eff, key, ms) {
  const p = pauseInfo(key)
  if (!p) return { error: 'нет такой настройки' }
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return { error: 'нужно число (секунды)' }
  const v = Math.round(ms / p.step) * p.step, bad = validatePauses({ [key]: v }).dropped[0]
  if (bad) return { error: `«${p.title}»: ${dur(v)} не принимается — можно от ${dur(p.min)} до ${dur(p.max)}${v < p.min ? ' (меньше нельзя: сцена сломается)' : ''}` }
  const next = { ...(draft ?? eff.overrides) }
  if (v === p.def) delete next[key]; else next[key] = v
  return { draft: next }
}

/** Что изменится, если применить черновик: [{ key, title, from, to }] относительно набора base ({ ключ: мс }, пропущенное — умолчание) */
export function changes(draft, base) {
  return SCENE_PAUSES.map(p => ({ key: p.key, title: p.title, from: base?.[p.key] ?? p.def, to: draft?.[p.key] ?? p.def })).filter(x => x.from !== x.to)
}
export const changesText = list => list.map(x => `${x.title}: ${dur(x.from)} → ${dur(x.to)}`).join('; ')

/** Набор для слоя устройства: всё, где желаемое отличается от сервера (значение по умолчанию пишется явно — оно отменяет серверное на этом устройстве) */
export function deviceSet(draft, server) {
  const out = {}
  for (const p of SCENE_PAUSES) { const want = draft?.[p.key] ?? p.def, srv = server?.[p.key] ?? p.def; if (want !== srv) out[p.key] = want }
  return out
}

// ── история и хранилище ──
export const dInit = (now = null) => ({ past: [], now, future: [] })
export const dPush = (h, draft) => (same(h.now, draft) && (h.now == null) === (draft == null) ? h : hPush(h, draft))
export const dUndo = hUndo
export const dRedo = hRedo
export function loadPauseDraft(store) {
  try { const o = JSON.parse(store?.get(PAUSE_DRAFT_KEY) ?? 'null'); if (!o || o.v !== 1) return dInit(); const ok = x => (x == null ? null : clean(x)); return { past: (o.past ?? []).map(ok), now: ok(o.now), future: (o.future ?? []).map(ok) } } catch { return dInit() }
}
export const savePauseDraft = (store, h, now = new Date()) => store?.set(PAUSE_DRAFT_KEY, JSON.stringify({ v: 1, savedAt: now.toISOString(), now: h.now, past: h.past.slice(-100), future: h.future.slice(0, 100) }))

// ── применение ──
/** «📱 Попробовать на этом устройстве»: → { ok, text } */
export function applyDevice(api, draft, server) {
  const set = deviceSet(draft, server), r = api.saveDevice(set)
  if (!r?.ok) return { ok: false, text: '✗ На этом устройстве не сохранилось: хранилище браузера недоступно (приватный режим?). Черновик остался.' }
  return { ok: true, text: Object.keys(set).length ? `📱 Сохранено на этом устройстве (${Object.keys(set).length}): действует со следующей игры ТОЛЬКО здесь. У других игроков ничего не изменилось.` : '📱 На этом устройстве своих значений больше нет — действует то, что на сервере.' }
}

/** «🌍 Применить для всех игроков»: запись на сервер, потом чтение обратно. → { ok, text, server (что теперь на сервере) } */
export async function applyServer(api, draft) {
  const want = clean(draft ?? {})
  let r
  try { r = await api.saveServer(want) } catch (e) { r = { ok: false, error: String(e?.message ?? e) } }
  if (!r?.ok) return { ok: false, text: `✗ Для всех не сохранилось: ${r?.error || 'нет ответа'}. Запись для всех игроков проходит только у админа и при работающей сети. Черновик остался, у игроков ничего не изменилось.` }
  let back = null
  try { back = await api.readServer() } catch { back = null }
  const got = back?.ok ? clean(back.value?.pauses ?? {}) : null
  if (!got || !same(got, want)) return { ok: true, server: want, text: `🌍 Запись принята, но прочитать её обратно не удалось${back?.error ? ` (${back.error})` : ''} — проверь «обновить». ${MIGRATION_NOTE}.` }
  try { api.saveDevice({}) } catch { /* слой устройства не мешает */ }
  return { ok: true, server: got, text: `🌍 Сохранено на сервере (прочитано обратно): ${Object.keys(got).length ? `изменено настроек — ${Object.keys(got).length}` : 'все паузы по умолчанию'}. Игра изменится у всех со следующего запуска; ${MIGRATION_NOTE}. Свои значения этого устройства сняты — здесь действует то же, что у всех.` }
}
