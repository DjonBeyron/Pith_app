// «Риски сцены»: места сценария «Встряхни память», где ДЛИНА реплики влияет на сцену (CONCEPT_TIMELINE.md, «Проверка сценария»). Таблица — данными (RISK_RULES): что проверяем, откуда число, пояснение человеку.
// Числа читаются из экспортов игры, не копируются: потолки стадий — из самих стадий (stage.waitCap, stage.ms: MIA_WAIT_CAP_MS, BOSS_WAIT_CAP_MS, MIA_END_MS, BOSS_END_MS), сколько держится концовка — boss/raceEndHold.endHoldMs,
// сроки реплик церемоний — машина Мии (delay у cue) и bossShift, пауза очереди — miaSpeech.miaGap, запас на слово — miaSpeech.WORD_MS, потолок ожидания колкости перед концовкой — useMiaEnter.END_WAIT_MAX_MS,
// потолок реплики примера «Скажи» — racePhraseDemo.DEMO_LINE_CAP_MS, разворот — raceReverseTurn.REV_MS + REV_WAIT_CAP_MS, события на репликах — boss/bossScale (DEMO_START, REVEAL_AT, FLASH_LINES), useMiaPlate.SPEED_ID.
// СВОИ пороги (в игре таких чисел нет, это рекомендации проверки): QUIET_EDGE_S — тишина между репликами церемонии длиннее 1,7 с (на такую тишину владелец уже жаловался: «игра долго молчит»);
// SHORT_SOFT_MS — короткая реплика внутри круга дольше 3 с (пока она звучит, следующее слово ждёт); EDGE_K — «на грани», когда занято больше 85 % запаса.
// durOf(id) → { ms, est } — длина реплики (est — оценка по тексту: звука нет). → строки { key, title, status: 'ok' | 'edge' | 'bad', text, ids, source }. Чистые функции без React.
import { endHoldMs } from '../../pitrace/boss/raceEndHold.js'
import { bossShift } from '../../pitrace/mia/raceMia.js'
import { miaGap, WORD_MS } from '../../pitrace/mia/miaSpeech.js'
import { END_WAIT_MAX_MS } from '../../pitrace/mia/useMiaEnter.js'
import { SPEED_ID } from '../../pitrace/mia/useMiaPlate.js'
import { DEMO_START, REVEAL_AT, FLASH_LINES } from '../../pitrace/boss/bossScale.js'
import { DEMO_LINES, DEMO_MORE, DEMO_LINE_CAP_MS } from '../../pitrace/racePhraseDemo.js'
import { REV_MS, REV_WAIT_CAP_MS } from '../../pitrace/raceReverseTurn.js'
import { GOOD_IDS, OK_IDS } from '../../pitrace/raceGood.js'
import { ceremonyCues } from './scenarioGame.js'
import { sec } from './lineCheck.js'

export const QUIET_EDGE_S = 1.7
export const SHORT_SOFT_MS = 3000
export const EDGE_K = 0.85
const s = ms => sec(ms / 1000)

/** Очередь речи церемонии по времени: реплика начинается не раньше своего срока (delay) и не раньше конца прежней + пауза очереди. → [{ id, start, end, quiet (тишина перед ней), late (на сколько позже срока) }] */
export function playQueue(cues, durOf, gap) {
  let free = 0, prevEnd = 0
  return cues.map((c, i) => {
    const start = Math.max(c.delay ?? 0, i ? free : 0), d = durOf(c.id), end = start + d.ms + (c.word ? WORD_MS : 0)
    const row = { id: c.id, start, end, est: !!d.est, quiet: i ? Math.max(0, start - prevEnd) : 0, late: Math.max(0, start - (c.delay ?? 0)) }
    prevEnd = end; free = end + (c.lead ? 0 : gap) // после реплики стадии (её говорит сам Пит) паузы очереди нет
    return row
  })
}

const fit = (need, cap, soft = false) => (need > cap ? (soft ? 'edge' : 'bad') : need > cap * EDGE_K ? 'edge' : 'ok')
const FIT_WORD = { ok: 'в порядке', edge: 'на грани', bad: 'не помещается' }

function ceremonyRows(key, title, cues, stage, durOf, gap) {
  if (!cues.length) return []
  const q = playQueue(cues, durOf, gap), total = q.at(-1).end, cap = stage?.waitCap ?? Infinity, out = []
  const st = fit(total, cap)
  out.push({ key: `${key}-cap`, title: `${title}: вся речь`, status: st, ids: cues.map(c => c.id), source: 'потолок ожидания церемонии (stage.waitCap)',
    text: `${FIT_WORD[st]}: речь церемонии ≈ ${s(total)} при потолке ${s(cap)}${st === 'bad' ? ' — отсчёт и слова начнутся, пока герои ещё говорят' : ''}` })
  q.forEach((r, i) => { if (i && r.quiet / 1000 > QUIET_EDGE_S) out.push({ key: `${key}-quiet-${r.id}`, title: `${title}: тишина перед репликой`, status: 'edge', ids: [cues[i - 1].id, r.id], source: 'сроки реплик церемонии (машина Мии) и длина предыдущей реплики',
    text: `перед этой репликой тишина ${s(r.quiet)}: она назначена на ${s(cues[i].delay ?? 0)} от начала церемонии, а предыдущая кончается раньше (в это время идёт только анимация)` }) })
  return out
}

function endRows(key, title, ends, durOf) {
  return ends.flatMap((e, i) => {
    if (!e.stage || !(e.stage.ms > 0)) return []
    let need
    try { need = endHoldMs({ ...e.stage, ms: Infinity, preWait: 0 }, { m: e.m }, { msOf: id => durOf(id).ms }) } catch { return [{ key: `${key}-end${i}`, title: `${title} — ${e.title}`, status: 'edge', ids: e.cues.map(c => c.id), source: 'boss/raceEndHold.endHoldMs', text: 'не удалось посчитать, сколько держится концовка (игра изменила расчёт) — проверить вручную' }] }
    if (!Number.isFinite(need) || need <= 1000) return [] // концовка без речи под потолок (Пит остался в коробке: её снимает ученик)
    const st = fit(need, e.stage.ms)
    return [{ key: `${key}-end${i}`, title: `${title} — ${e.title}`, status: st, ids: e.cues.map(c => c.id), source: 'потолок концовки (stage.ms) и boss/raceEndHold.endHoldMs',
      text: `${FIT_WORD[st]}: концовке нужно ${s(need)} при потолке ${s(e.stage.ms)}${st === 'bad' ? ' — следующий экран выйдет, пока реплики ещё звучат' : ''}` }]
  })
}

const maxRows = (key, title, ids, cap, durOf, o) => ids.flatMap(id => {
  const d = durOf(id), st = fit(d.ms, cap, o.soft)
  return st === 'ok' && !o.always ? [] : [{ key: `${key}-${id}`, title, status: st, ids: [id], source: o.source, text: `${FIT_WORD[st]}: длина ${s(d.ms)}${d.est ? ' (оценка по тексту, звука нет)' : ''} при запасе ${s(cap)} — ${o.why}` }]
})

const EVENTS = () => [
  [DEMO_START, `на ${Math.round(REVEAL_AT * 100)} % этой реплики появляется шкала`],
  ...Object.entries(FLASH_LINES).map(([id, z]) => [id, `пока звучит эта реплика, мигает ${{ fast: 'зелёная', mid: 'жёлтая', slow: 'красная' }[z] ?? z} зона шкалы`]),
  [SPEED_ID, 'с этой реплики дорожки желтеют и ускоряются'],
]

/** Все риски сцены по сценарию (scenarioBuild.buildScenario) и длинам реплик */
export function sceneRisks(scenario, durOf, gap = miaGap()) {
  const { sim } = scenario, has = id => scenario.ids.has(id), rows = []
  rows.push(...ceremonyRows('mia-cer', 'Церемония Мии', sim.mia.ceremony.cues, sim.mia.ceremony.stage, durOf, gap))
  for (const [key, title, seen] of [['boss-cer', 'Церемония экзамена', true], ['boss-cer-new', 'Церемония экзамена (Мию ещё не видели)', false]]) {
    const base = seen ? sim.boss.ceremony : sim.boss.ceremonyNew, pit = base.cues.find(c => c.who === 'pit')
    const cer = ceremonyCues(sim.stages, 'boss', seen, pit ? bossShift(durOf(pit.id).ms) : 0) // как в игре: Мия начинает вскоре после реплики Пита (bossShift)
    rows.push(...ceremonyRows(key, title, cer.cues, cer.stage, durOf, gap))
  }
  rows.push(...endRows('mia', 'Концовка допроса', sim.mia.ends, durOf), ...endRows('boss', 'Концовка экзамена', sim.boss.ends, durOf))
  const [jabs = [], helps = []] = sim.boss.fail ?? []
  if (jabs.length) {
    const long = list => list.reduce((a, c) => (durOf(c.id).ms > durOf(a.id).ms ? c : a), list[0])
    const j = long(jabs), h = helps.length ? long(helps) : null, need = durOf(j.id).ms + (h ? gap + durOf(h.id).ms + WORD_MS : 0), st = fit(need, END_WAIT_MAX_MS)
    rows.push({ key: 'boss-last', title: 'Экзамен: речь после последнего слова', status: st, ids: [j.id, ...(h ? [h.id] : [])], source: 'mia/useMiaEnter.END_WAIT_MAX_MS, miaSpeech.WORD_MS',
      text: `${FIT_WORD[st]}: колкость Мии${h ? ', подсказка Пита и верное слово' : ''} — до ${s(need)} при запасе ${s(END_WAIT_MAX_MS)}${st === 'bad' ? ' — концовка начнётся, не дождавшись конца речи' : ''} (самые длинные варианты)` })
  }
  rows.push(...maxRows('demo', 'Пример «Скажи»: реплика Пита перед словом', [...DEMO_LINES, DEMO_MORE].filter(has), DEMO_LINE_CAP_MS, durOf, { source: 'racePhraseDemo.DEMO_LINE_CAP_MS', why: 'дольше пример реплику не ждёт: слово прозвучит поверх неё' }))
  rows.push(...maxRows('turn', 'Разворот конвейера: реплика Пита', sim.stages.filter(x => x.rev && x.line).map(x => x.line), REV_MS + REV_WAIT_CAP_MS, durOf, { soft: true, source: 'raceReverseTurn.REV_MS + REV_WAIT_CAP_MS', why: 'реплика идёт вместе с разворотом пилюль; длиннее — следующая плашка выйдет, пока Пит договаривает' }))
  const short = [...GOOD_IDS, ...OK_IDS, ...scenario.blocks.flatMap(b => b.parts.filter(p => /^(win|fail)/.test(p.key)).flatMap(p => p.items.map(x => x.id)))]
  rows.push(...maxRows('short', 'Короткая реплика внутри круга', [...new Set(short)].filter(has), SHORT_SOFT_MS, durOf, { soft: true, source: 'рекомендация проверки (в игре потолка нет)', why: 'пока она звучит, следующее слово ждёт' }))
  for (const [id, what] of EVENTS()) if (has(id)) { const d = durOf(id); rows.push({ key: `event-${id}`, title: 'Событие привязано к реплике', status: d.est ? 'edge' : 'ok', ids: [id], source: 'boss/bossScale, mia/useMiaPlate', text: `${what}${d.est ? ' — звука нет, событие пойдёт по длине подписи' : ` (длина ${s(d.ms)}; событие идёт за звуком, длина может быть любой)`}` }) }
  return rows
}

/** Риски по репликам: { [id]: [строка…] } — только «на грани» и «не помещается» */
export function risksById(rows) {
  const out = {}
  for (const r of rows) if (r.status !== 'ok') for (const id of r.ids) (out[id] ??= []).push(r)
  return out
}
