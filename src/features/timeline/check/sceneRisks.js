// «Риски сцены»: места сценария «Встряхни память», где ДЛИНА или РАЗМЕТКА реплики влияет на сцену (CONCEPT_TIMELINE.md, «Проверка сценария»). Что проверяем, откуда число, пояснение человеку.
// После правок игры 2026-11-24 реплики церемоний и концовок идут очередью по РЕАЛЬНОМУ концу звука — фиксированных сроков и «потолка концовки 18 с» больше нет, длинная реплика их не ломает.
// Остались страховочные потолки и привязки (числа читаются из экспортов игры, не копируются):
//  • вся речь церемонии — stage.waitCap (MIA_WAIT_CAP_MS, BOSS_WAIT_CAP_MS); тишина перед репликой церемонии — сроки «не раньше» машины Мии (delay) и, у экзамена, bossShift + boss/bossMia.ceremonyTimes;
//  • экзамен: речь хода (колкость → подсказка + слово → «Следующее слово») — stage.step.holdMax (BOSS_HOLD_MAX_MS); речь после последнего слова — examEndWait.DRAIN_CAP_MS; речь исхода — examEndWait.END_CAP_MS;
//  • допрос: колкость о последнем слове — useMiaEnter.END_WAIT_MAX_MS; речь концовки «все верны» — miaCircleEnd.CIRCLE_WAIT_CAP_MS;
//  • пример «Скажи» — racePhraseDemo.DEMO_LINE_CAP_MS; разворот — raceReverseTurn.REV_MS + REV_WAIT_CAP_MS;
//  • события на репликах — boss/bossScale: шкала появляется на слове REVEAL_WORD реплики DEMO_START (bossScale.revealAtMs: по таймингам слов записи; без них — приблизительно, по месту слова в тексте), зоны мигают на FLASH_LINES; дорожки ускоряются с useMiaPlate.SPEED_ID.
// СВОИ пороги (в игре таких чисел нет, это рекомендации проверки): QUIET_EDGE_S — тишина между репликами церемонии длиннее 1,7 с; SHORT_SOFT_MS — короткая реплика внутри круга дольше 3 с (пока она звучит, следующее слово ждёт); EDGE_K — «на грани» от 85 % запаса.
// durOf(id) → { ms, est } — длина реплики (est — оценка по тексту: звука нет); recOf(id) — запись реплики из настроек ({ text, words, duration }; нет — null). → строки { key, title, status: 'ok' | 'edge' | 'bad', text, ids, source }. Чистые функции без React.
import { BOSS, bossShift } from '../../pitrace/mia/raceMia.js'
import { ceremonyTimes } from '../../pitrace/boss/bossMia.js'
import { DRAIN_CAP_MS, END_CAP_MS } from '../../pitrace/boss/examEndWait.js'
import { CIRCLE_WAIT_CAP_MS } from '../../pitrace/mia/miaCircleEnd.js'
import { miaGap, WORD_MS } from '../../pitrace/mia/miaSpeech.js'
import { END_WAIT_MAX_MS } from '../../pitrace/mia/useMiaEnter.js'
import { SPEED_ID } from '../../pitrace/mia/useMiaPlate.js'
import { DEMO_START, REVEAL_WORD, FLASH_LINES } from '../../pitrace/boss/bossScale.js'
import { DEMO_LINES, DEMO_MORE, DEMO_LINE_CAP_MS } from '../../pitrace/racePhraseDemo.js'
import { REV_MS, REV_WAIT_CAP_MS } from '../../pitrace/raceReverseTurn.js'
import { GOOD_IDS, OK_IDS } from '../../pitrace/raceGood.js'
import { pauseMs } from '../../../shared/lib/scenePauses.js'
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

/** Речь подряд (очередь по концу звука): сумма длин + паузы очереди + запас на слово после подсказки */
const chainMs = (cues, durOf, gap) => cues.reduce((a, c, i) => a + (i ? gap : 0) + durOf(c.id).ms + (c.word ? WORD_MS : 0), 0)
const longest = (list, durOf) => list.reduce((a, c) => (durOf(c.id).ms > durOf(a.id).ms ? c : a), list[0])
const capRow = (key, title, cues, cap, durOf, gap, source, what, bad) => {
  const need = chainMs(cues, durOf, gap), st = fit(need, cap)
  return { key, title, status: st, ids: cues.map(c => c.id), source, text: `${FIT_WORD[st]}: ${what} — до ${s(need)} при запасе ${s(cap)}${st === 'bad' ? ` — ${bad}` : ''}` }
}

/** Когда появится шкала: по таймингам слов записи — точно; без них — приблизительно (как решает bossScale.revealAtMs) */
function revealRow(id, recOf, durOf) {
  const rec = recOf(id), d = durOf(id), text = String(rec?.text ?? '').toLowerCase()
  const word = (Array.isArray(rec?.words) ? rec.words : []).find(x => String(x?.w ?? '').toLowerCase().startsWith(REVEAL_WORD) && Number.isFinite(x.t))
  const base = { key: `event-${id}`, title: 'Шкала появляется на слове «шкала» этой реплики', ids: [id], source: 'boss/bossScale.revealAtMs, REVEAL_WORD' }
  if (!d.est && word) return { ...base, status: 'ok', text: `в порядке: слово «шкала» в записи на ${s(word.t * 1000)} — шкала появится точно на нём` }
  if (d.est) return { ...base, status: 'edge', text: 'звука нет — шкала появится по длине подписи, приблизительно' }
  if (!text.includes(REVEAL_WORD)) return { ...base, status: 'edge', text: 'в тексте реплики нет слова «шкала» — шкала появится примерно посередине реплики; проверь на слух' }
  return { ...base, status: 'edge', text: 'нет разметки слов у этой реплики — шкала появится приблизительно (по месту слова в тексте); нажми «Разметить рот заново» или озвучь заново' }
}

const maxRows = (key, title, ids, cap, durOf, o) => ids.flatMap(id => {
  const d = durOf(id), st = fit(d.ms, cap, o.soft)
  return st === 'ok' && !o.always ? [] : [{ key: `${key}-${id}`, title, status: st, ids: [id], source: o.source, text: `${FIT_WORD[st]}: длина ${s(d.ms)}${d.est ? ' (оценка по тексту, звука нет)' : ''} при запасе ${s(cap)} — ${o.why}` }]
})

const EVENTS = () => [
  ...Object.entries(FLASH_LINES).map(([id, z]) => [id, `пока звучит эта реплика, мигает ${{ fast: 'зелёная', mid: 'жёлтая', slow: 'красная' }[z] ?? z} зона шкалы`]),
  [SPEED_ID, 'с этой реплики дорожки желтеют и ускоряются'],
]

/** Сроки церемонии экзамена, как их считает игра на входе (mia/useMiaEnter): Мия начинает вскоре после реплики Пита, объяснение шкалы — после реального конца её реплики из-за края */
function examTimes(pitMs, hushMs) {
  const shift = bossShift(pitMs)
  const t = ceremonyTimes({ hushAt: Math.max(BOSS.HUSH_AT + shift, pauseMs('boss.pit1At') + pitMs + BOSS.AFTER_PIT_MS), jumpAbs: BOSS.JUMP_ABS + shift, lookAt: BOSS.LOOK_AT + shift }, hushMs)
  return { shift, lookAt: t.lookAt }
}

/** Все риски сцены по сценарию (scenarioBuild.buildScenario), длинам реплик и их записям */
export function sceneRisks(scenario, durOf, { gap = miaGap(), recOf = () => null } = {}) {
  const { sim } = scenario, has = id => scenario.ids.has(id), rows = []
  rows.push(...ceremonyRows('mia-cer', 'Церемония Мии', sim.mia.ceremony.cues, sim.mia.ceremony.stage, durOf, gap))
  for (const [key, title, seen] of [['boss-cer', 'Церемония экзамена', true], ['boss-cer-new', 'Церемония экзамена (Мию ещё не видели)', false]]) {
    const base = seen ? sim.boss.ceremony : sim.boss.ceremonyNew, pit = base.cues.find(c => c.who === 'pit'), hush = base.cues.find(c => c.who === 'mia')
    const cer = ceremonyCues(sim.stages, 'boss', seen, pit ? examTimes(durOf(pit.id).ms, hush ? durOf(hush.id).ms : 0) : {})
    rows.push(...ceremonyRows(key, title, cer.cues, cer.stage, durOf, gap))
  }
  const win = sim.mia.ends.find(e => e.m?.why === 'win')
  if (win) rows.push(capRow('mia-end', `Концовка допроса — ${win.title}`, win.cues, CIRCLE_WAIT_CAP_MS, durOf, gap, 'mia/miaCircleEnd.CIRCLE_WAIT_CAP_MS', 'речь Мии и Пита', 'разворот начнётся, пока они ещё говорят'))
  if (sim.mia.jabs?.length) rows.push(capRow('mia-last', 'Допрос: колкость о последнем слове', [longest(sim.mia.jabs, durOf)], END_WAIT_MAX_MS, durOf, gap, 'mia/useMiaEnter.END_WAIT_MAX_MS', 'самая длинная колкость Мии', 'концовка начнётся, не дождавшись её конца'))
  const [jabs = [], helps = [], nexts = []] = sim.boss.fail ?? []
  if (jabs.length) {
    const turn = [longest(jabs, durOf), ...(helps.length ? [longest(helps, durOf)] : [])], hold = sim.stages.find(x => x.act === 'boss' && x.mia === 'round')?.step?.holdMax
    if (hold > 0) rows.push(capRow('boss-turn', 'Экзамен: речь после ушедшего слова', [...turn, ...nexts.slice(0, 1)], hold, durOf, gap, 'потолок удержания пилюли экзамена (stage.step.holdMax, BOSS_HOLD_MAX_MS)', 'колкость Мии, подсказка Пита с верным словом и «Следующее слово» (самые длинные варианты)', 'следующая пилюля выедет, пока они ещё говорят'))
    rows.push(capRow('boss-last', 'Экзамен: речь после последнего слова', turn, DRAIN_CAP_MS, durOf, gap, 'boss/examEndWait.DRAIN_CAP_MS', 'колкость Мии и подсказка Пита с верным словом (самые длинные варианты)', 'реплики исхода начнутся, не дождавшись конца'))
  }
  sim.boss.ends.forEach((e, i) => rows.push(capRow(`boss-end${i}`, `Концовка экзамена — ${e.title}`, e.cues, END_CAP_MS, durOf, gap, 'boss/examEndWait.END_CAP_MS (конец ведёт реальный конец речи; это страховка)', 'реплики исхода', 'итог выйдет, пока они ещё говорят')))
  rows.push(...maxRows('demo', 'Пример «Скажи»: реплика Пита перед словом', [...DEMO_LINES, DEMO_MORE].filter(has), DEMO_LINE_CAP_MS, durOf, { source: 'racePhraseDemo.DEMO_LINE_CAP_MS', why: 'дольше пример реплику не ждёт: слово прозвучит поверх неё' }))
  const revIds = [...new Set(scenario.blocks.find(b => b.key === 'turn')?.parts.find(p => p.key === 'ann')?.items.map(x => x.id) ?? [])]
  rows.push(...maxRows('turn', 'Разворот конвейера: реплика Пита', revIds, REV_MS + REV_WAIT_CAP_MS, durOf, { soft: true, source: 'raceReverseTurn.REV_MS + REV_WAIT_CAP_MS', why: 'реплика идёт вместе с разворотом пилюль; длиннее — следующая плашка выйдет, пока Пит договаривает' }))
  const short = [...GOOD_IDS, ...OK_IDS, ...scenario.blocks.flatMap(b => b.parts.filter(p => /^(win|fail)/.test(p.key)).flatMap(p => p.items.map(x => x.id)))]
  rows.push(...maxRows('short', 'Короткая реплика внутри круга', [...new Set(short)].filter(has), SHORT_SOFT_MS, durOf, { soft: true, source: 'рекомендация проверки (в игре потолка нет)', why: 'пока она звучит, следующее слово ждёт' }))
  if (has(DEMO_START)) rows.push(revealRow(DEMO_START, recOf, durOf))
  for (const [id, what] of EVENTS()) if (has(id)) { const d = durOf(id); rows.push({ key: `event-${id}`, title: 'Событие привязано к реплике', status: d.est ? 'edge' : 'ok', ids: [id], source: 'boss/bossScale, mia/useMiaPlate', text: `${what}${d.est ? ' — звука нет, событие пойдёт по длине подписи' : ` (длина ${s(d.ms)}; событие идёт за звуком, длина может быть любой)`}` }) }
  return rows
}

/** Риски по репликам: { [id]: [строка…] } — только «на грани» и «не помещается» */
export function risksById(rows) {
  const out = {}
  for (const r of rows) if (r.status !== 'ok') for (const id of r.ids) (out[id] ??= []).push(r)
  return out
}
