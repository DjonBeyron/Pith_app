// «Начать с этапа» для админа (CONCEPT_RACE.md, «Отладка»): на плашке «Голосом / Пальцами» при включённой отладке (тумблер «Отладочный интерфейс» app_settings.player_debug_ui или pithy_wl_debug_v1 = '1') — выбор, с какого этапа начать.
// Тот же механизм, что у стенда ?only=… (raceOnly.pickRound): акты до этапа выбрасываются (fromStage, raceRecipe.js), стадии внутри первого акта — до плашки этапа (sliceFrom, raceStages.js); состояние раундов — нейтральное (raceState.initRace).
// Пункты списка (startEntries) — из самих стадий: плашки этапов и кругов (sid …-ann) и итог, подписи — названия актов и плашек кругов. plan.startAt — sid плашки, plan.debugStart — итог не пишет память и XP (raceSim.js, raceMemory.memoryOn).
import { extraTarget } from './raceExtraRound.js'
import { RACE_TITLES } from './raceOnly.js'
import { miaTarget } from './mia/miaRound.js'
import { bossFill } from './boss/bossWords.js'
import { initRace } from './raceState.js'

export const START_STAGE_KEY = 'pithy_race_start_stage_v1'

/** Запомненный этап ('' — с начала); нет хранилища или сбой — с начала */
export function readStartStage(store = globalThis.localStorage) {
  try { return store?.getItem(START_STAGE_KEY) || '' } catch { return '' }
}

/** Запомнить этап; '' — с начала (ключ стирается) */
export function writeStartStage(sid, store = globalThis.localStorage) {
  try { if (sid) store?.setItem(START_STAGE_KEY, sid); else store?.removeItem(START_STAGE_KEY) } catch { /* не записалось: останется прежний */ }
}

/** Акт плашки по её sid: 'sprint2-ann' → 'sprint', 'phrases2-ann' → 'phrases', 'summary' → 'summary' */
export const actOfSid = sid => String(sid ?? '').split('-')[0].replace(/\d+$/, '')

/** Акты рецепта, начиная с акта этапа startAt; нет startAt или такого акта — все */
export function fromStage(acts, startAt) {
  const i = startAt ? acts.findIndex(a => a.id === actOfSid(startAt)) : -1
  return i > 0 ? acts.slice(i) : acts
}

const isSwitch = st => st?.round?.kind === 'switch'
const passOf = id => /^Проход (\S+)$/.exec(RACE_TITLES[id] ?? '')?.[1] // 'sprint' → 'A', 'catch' → 'B'

/**
 * Пункты «Начать с» по стадиям полной гонки: [{ sid, label }] — первая плашка цепочки плашек перед раундом (кроме самой первой стадии: это «с начала» и переключения слуха) и итог.
 * Подпись: название акта (у проходов — с буквой: «Пинг-понг A»), «круг 2» у второго круга, названия плашек кругов через «: » («Фразы: Пойми»); alt — { sid: второе название } (круг 2 фраз пальцами — «Узнай»).
 */
export function startEntries(stages, acts, alt = {}) {
  const out = []
  stages.forEach((st, i) => {
    const act = acts.find(a => a.id === st.act)
    if (!act || i === 0) return
    if (st.type === 'summary') { out.push({ sid: st.sid, label: act.title }); return }
    if (st.type !== 'announce' || isSwitch(st) || !st.sid.endsWith('-ann')) return
    const prev = stages[i - 1]
    if (prev?.type === 'announce' && !isSwitch(prev) && prev.act === st.act) return // плашка внутри цепочки («Пойми» после «Фразы»)
    let j = i
    const subs = []
    while (stages[j]?.type === 'announce' && stages[j].act === st.act && !isSwitch(stages[j])) { const t = stages[j].round?.title; if (t && t !== act.title) subs.push(t); j++ }
    if (alt[stages[j - 1].sid]) subs.push(`/ ${alt[stages[j - 1].sid]}`)
    const two = st.mia === 'ann' && st.act !== 'boss' ? ': круг с Мией' : /\d-ann$/.exec(st.sid) && !st.round?.title ? `, круг ${st.sid.match(/(\d+)-ann$/)[1]}` : ''
    out.push({ sid: st.sid, label: `${act.title}${passOf(act.id) ? ` ${passOf(act.id)}` : ''}${two}${subs.length ? `: ${subs.join(' ')}` : ''}` })
  })
  return out
}

/**
 * Обрезать стадии (на месте — методы fill ищут свою стадию в этом же массиве) так, чтобы первой шла плашка sid; перед ней остаётся переключение слуха на русскую модель того же акта (проход B голосом).
 * Второй круг прохода: слова вписываются, как будто в первом круге все слова слабые (нейтральные результаты — raceExtraRound.extraTarget). → true — плашка первая (обрезано или уже была первой), false — такой нет.
 */
export function sliceFrom(stages, sid, seed) {
  const at = stages.findIndex(x => x.sid === sid)
  if (sid === 'boss-ann' && at >= 0) bossFill(stages, initRace(), seed) // начать с финала: результатов нет — слова по семени (финал обычно уже первая стадия: акты до него выброшены)
  if (at <= 0) return at === 0 // уже первая (акты до неё выбросил рецепт) — резать нечего
  const act = stages[at].act
  const r1 = stages.find(x => x.type === 'student' && x.sid === act && ['sprint', 'catch'].includes(act))
  if (r1 && (sid === `${act}2-ann` || sid === `${act}3-ann`)) extraTarget(stages, r1, { results: {} }, seed)
  if (stages[at].mia === 'ann') miaTarget(stages, act, seed) // начать с круга Мии: слова вписаны, как будто ученик ошибся во втором круге (обычный круг 2 заполнен выше)
  const sw = stages.slice(0, at).findLast(x => x.act === act && x.switchTo === 'ru')
  const out = [...(sw ? [sw] : []), ...stages.slice(at)]
  out.forEach((x, idx) => { x.idx = idx })
  stages.splice(0, stages.length, ...out)
  return true
}

/** План игры со стартом с этапа (отладка): startAt — sid плашки, startLabel — подпись для журнала, debugStart — итог не пишет память и XP */
export const withStart = (plan, entry) => (plan && entry ? { ...plan, startAt: entry.sid, startLabel: entry.label, debugStart: true } : plan)
