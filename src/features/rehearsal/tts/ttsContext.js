// Контекст соседних реплик для ElevenLabs: поля previous_text / next_text запроса подсказывают модели, что было сказано до и что будет после, — интонация конца фразы получается «в разговоре», а не оборванной.
// Соседи — реплики, которые в игре «Встряхни память» звучат ПОДРЯД одной сценой (церемонии Мии, пример Пита, концовки). Порядок продублирован из сценария игры (timeline/check/scenarioBuild.js — он тянет
// за собой всю игру, в админку озвучки его не подключаем); сторож ttsContext.test.js сверяет каждую цепочку с последовательной частью сценария. Реплика стоит не больше чем в одной цепочке.
// У последней реплики цепочки next_text нет; у «продолжающейся» реплики (ttsText.isOpenLine) — тоже. Сосед — другой ведущий: это нормально, поле — текст беседы, а не голос.
// Выключатель «контекст соседних реплик» — в админке (admin/speech/VoiceTonePanel.jsx); хранится в памяти браузера админа (на игру не влияет: игра играет готовые файлы).
// ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН (v3.3.372, владелец 2026-11-26: «в конце фразы слышен кусочек следующей, в начале — кусочек предыдущей, будто нечётко нарезали»). По журналу игры реплики не накладываются
// (между соседними 0,35–0,43 с тишины, длина звука совпадает с записью до 16 мс) — значит, лишний звук в самих файлах; он появился вместе с контекстом, а «затягивание» соседнего текста в клип —
// известный риск previous_text / next_text. Сами файлы не прослушаны (хранилище из сессии недоступно). Ключ памяти новый (v2): прежний выбор «включён по умолчанию» не наследуется.
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

const KEY = 'pithy_tts_context_v2'
let mem = false // память браузера недоступна (частный режим, тесты) — выбор живёт до перезагрузки страницы
/** Включён ли контекст соседних реплик (по умолчанию НЕТ) */
export function contextOn() { try { const v = globalThis.localStorage?.getItem(KEY); return v == null ? mem : v === '1' } catch { return mem } }
export function setContextOn(on) { mem = !!on; try { if (on) globalThis.localStorage?.setItem(KEY, '1'); else globalThis.localStorage?.removeItem(KEY) } catch { /* остаётся выбор в памяти страницы */ } }

/** Контекст для запроса озвучки реплики id: { previousText?, nextText? } — тексты для диктора соседей (со знаками); lines — реплики из настроек (normalizeLines). Соседей нет или выключено — null */
export function contextOf(id, lines, on = contextOn()) {
  if (!on) return null
  const { prev, next } = neighborsOf(id), out = {}
  const say = n => (n && lines?.[n]?.text && !lines[n].text.includes('{') ? dictorText(n, lines[n]) : '')
  if (say(prev)) out.previousText = say(prev)
  if (!isOpenLine(id) && say(next)) out.nextText = say(next)
  return Object.keys(out).length ? out : null
}
