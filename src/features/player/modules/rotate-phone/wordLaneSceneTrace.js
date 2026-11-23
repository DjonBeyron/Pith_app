// Запись игры в трассу сцены (shared/lib/sceneTrace.js, CONCEPT_TIMELINE.md): переводит объекты директора и движка пилюль (стадия, повтор rep, событие движка) в плоские события для «Таймлайна игры» админа.
// Только запись: ни одна функция не бросает (ошибка проглатывается), ничего не возвращает игре, не читает DOM, не ставит таймеров и подписок — поведение игры от неё не зависит. Вызовы — одной строкой
// рядом с уже существующими точками: директор (useWordLaneFlow: pre / spawn / claim / win / miss / fail / finished / пауза / конец) и директор гонки (useRaceActs: старт, вход в стадию).
import { sceneTrace, scenePush } from '../../../../shared/lib/sceneTrace.js'
import { getPauseOverrides, pausesLogLine, pausesToParam } from '../../../../shared/lib/scenePauses.js'
import { stagePauses } from '../../../../shared/lib/scenePauseTrace.js'
import { pLog } from '../../../../shared/lib/debug.js'

const safe = fn => (...a) => { try { fn(...a) } catch { /* трасса не мешает игре */ } }
const wordOf = rep => rep?.cap ?? rep?.text ?? rep?.target?.text ?? ''
const askOf = stages => { const st = (stages ?? []).filter(s => s?.step), tap = st.filter(s => s.step.tapOnly).length; return !tap ? 'voice' : tap === st.length ? 'tap' : 'mixed' } // чем отвечает игрок: голосом, тапом или часть ступеней тапом

/** Старт прохождения: режим (round — один этап стенда), семя, число стадий, чем отвечает игрок (voice / tap / mixed); pauses — переопределённые паузы-настройки этой игры строкой «ключ=мс,ключ=мс» (shared/lib/scenePauses.js: pausesToParam / parsePausesParam; поля нет — все по умолчанию) + строка журнала «[pauses] …» */
export const sceneRun = safe((plan, stages) => { const over = getPauseOverrides(); pLog(pausesLogLine()); sceneTrace.begin({ game: plan?.game ?? 'lane', only: plan?.round ?? null, seed: plan?.seed ?? null, stages: stages?.length ?? 0, ask: askOf(stages), ...(Object.keys(over).length ? { pauses: pausesToParam(over) } : {}) }) })
/** Вход в стадию (один раз на её запуск). pauses — какие паузы-настройки запечены в стадию: [{ key, ms, as (поле стадии или роль), set? }] (stage.knobs, pitrace/raceStagePauses.js) */
export const sceneStage = safe(st => { const pauses = stagePauses(st); scenePush('stage-in', { idx: st.idx, sid: st.sid, act: st.act, type: st.type, title: st.round?.title || '', line: st.line ?? null, ...(st.mia ? { mia: st.mia } : {}), ...(pauses.length ? { pauses } : {}) }) })
/** Движок доиграл ход стадии: дальше пауза выхода и следующая стадия */
export const sceneStageOut = safe(st => scenePush('stage-out', { idx: st?.idx, sid: st?.sid }))
/** Перед выездом пилюли (событие движка pre): Пит скажет слово / перевод / смысл. У этапа «Фразы» это начало хода (phrase) */
export const sceneAsk = safe(e => { const r = e?.rep; scenePush('ask', { idx: r?.idx, word: wordOf(r), ...(r?.round != null ? { phrase: true, mode: r.mode } : {}), ...(r?.demo ? { demo: true } : {}) }) })
/** Пилюля выехала (spawn) */
export const scenePill = safe(e => { const r = e?.rep ?? e?.prompt; scenePush('pill', { idx: r?.idx, word: wordOf(r), lane: r?.lanes?.[0] ?? r?.lane ?? null, speed: r?.speed }) })
/** Слово принято (claim): ms — от выезда пилюли */
export const sceneClaim = safe(e => scenePush('claim', { idx: e?.rep?.idx, ms: e?.ms }))
/** Исход: res — win | miss | fail; final: false — пилюля ещё едет (промах слова, не последний кусок) */
export const sceneAnswer = safe((res, rep) => scenePush('answer', { res, idx: rep?.idx, word: wordOf(rep), final: res === 'fail' || (res === 'win' ? rep?.last !== false : !!rep?.res), ...(rep?.res?.late ? { late: true } : {}) }))
