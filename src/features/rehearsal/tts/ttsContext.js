// Контекст соседних реплик для ElevenLabs: поля previous_text / next_text запроса подсказывают модели, что было сказано до и что будет после, — интонация конца фразы получается «в разговоре», а не оборванной.
// Соседи — реплики, которые в игре «Встряхни память» звучат ПОДРЯД одной сценой (церемонии Мии, пример Пита, концовки). Порядок продублирован из сценария игры (timeline/check/scenarioBuild.js — он тянет
// за собой всю игру, в админку озвучки его не подключаем); сторож ttsContext.test.js сверяет каждую цепочку с последовательной частью сценария. Реплика стоит не больше чем в одной цепочке.
// У последней реплики цепочки next_text нет; у «продолжающейся» реплики (ttsText.isOpenLine) — тоже. Сосед — другой ведущий: это нормально, поле — текст беседы, а не голос.
// Выключатель «контекст соседних реплик» — в админке (TtsContextToggle.jsx), по умолчанию включён; хранится в памяти браузера админа (на игру не влияет: игра играет готовые файлы).
import { dictorText, isOpenLine } from './ttsText.js'

export const CHAINS = [
  ['pit_forgot', 'mia_push', 'pit_panic', 'pit_reply', 'mia_announce_2', 'mia_announce_3'],
  ['mia_leave', 'pit_back_1'],
  ['mia_end', 'pit_end'],
  ['boss_pit_try', 'boss_pit_stuck'],
  ['race_demo_1', 'race_demo_2', 'race_demo_3', 'race_demo_more', 'race_phrases_say'],
  ['boss_pit_1', 'boss_mia_hush', 'boss_mia_look', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five', 'boss_pit_no', 'boss_mia_go'],
  ['boss_mia_free', 'boss_mia_bye', 'boss_pit_well'],
  ['boss_mia_stay', 'boss_pit_keep'],
]
const AROUND = Object.fromEntries(CHAINS.flatMap(c => c.map((id, i) => [id, { prev: c[i - 1] ?? null, next: c[i + 1] ?? null }])))
/** Соседи реплики по сценарию: { prev, next } (id или null) */
export const neighborsOf = id => AROUND[id] ?? { prev: null, next: null }

const KEY = 'pithy_tts_context_v1'
let mem = true // память браузера недоступна (частный режим, тесты) — выбор живёт до перезагрузки страницы
/** Включён ли контекст соседних реплик (по умолчанию да) */
export function contextOn() { try { const v = globalThis.localStorage?.getItem(KEY); return v == null ? mem : v !== '0' } catch { return mem } }
export function setContextOn(on) { mem = !!on; try { if (on) globalThis.localStorage?.removeItem(KEY); else globalThis.localStorage?.setItem(KEY, '0') } catch { /* остаётся выбор в памяти страницы */ } }

/** Контекст для запроса озвучки реплики id: { previousText?, nextText? } — тексты для диктора соседей (со знаками); lines — реплики из настроек (normalizeLines). Соседей нет или выключено — null */
export function contextOf(id, lines, on = contextOn()) {
  if (!on) return null
  const { prev, next } = neighborsOf(id), out = {}
  const say = n => (n && lines?.[n]?.text && !lines[n].text.includes('{') ? dictorText(n, lines[n]) : '')
  if (say(prev)) out.previousText = say(prev)
  if (!isOpenLine(id) && say(next)) out.nextText = say(next)
  return Object.keys(out).length ? out : null
}
