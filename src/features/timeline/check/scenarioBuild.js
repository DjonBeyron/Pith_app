// Полный сценарий «Встряхни память» на СЕЙЧАС: блоки реплик в порядке игры со всеми ветками и вариантами (CONCEPT_TIMELINE.md, «Проверка сценария»). Строится из кода игры (scenarioGame.js: стадии и машина Мии)
// и её экспортов (похвала — raceGood, пример «Скажи» — racePhraseDemo, итог хода фраз — racePhraseVoice / racePhraseSlip, помощь Пита — boss/bossHelp через машину), а не из записанной игры.
// → { blocks: [{ key, title, note, parts }], unused: [{ id, who, why }], ids: Set, sim } ; part = { key, title, kind, note, alt, items: [{ id, who, note, again }], cues, stage }
//   kind: 'seq' — звучат подряд; 'variants' — случайно одна из; 'branch' — одна из по условию (условие — в note реплики). alt — ветка не основного пути (режим «Пальцами», редкая страховка).
//   again — реплика уже стоит в блоке выше (в счёт проблем идёт один раз). cues — реплики со сроками машины Мии (для проверки пауз церемонии, sceneRisks.js).
// ПРОДУБЛИРОВАНО (в игре это строки внутри функций, экспорта нет; сторож — scenarioBuild.test.js читает исходник игры): YES_LINE, SHOW_LINE, DONE_LINES.
// Чистые функции без React.
import { MIA_LINES } from '../../pitrace/mia/miaLines.js'
import { raceStartId } from '../../pitrace/raceTexts.js'
import { GOOD_IDS, OK_IDS } from '../../pitrace/raceGood.js'
import { DEMO_LINES, DEMO_MORE, DEMO_GO } from '../../pitrace/racePhraseDemo.js'
import { AGAIN_LINE, PAUSES_LINE } from '../../pitrace/racePhraseVoice.js'
import { SLIP_WORD_LINE, SLIP_RETRY_LINE, SLIP_NEXT_LINE } from '../../pitrace/racePhraseSlip.js'
import { RACE_LINE_SET } from '../../admin/speech/voiceAudit.js'
import { REV_LINE_AFTER_MIA } from '../../pitrace/mia/miaCircleEnd.js'
import { FREE_PCT, MID_PCT } from '../../pitrace/boss/bossTrophies.js'
import { gameStages, ceremonyCues, roundCues, endCues, boxCues, fallbackCues, FAIL_WHY } from './scenarioGame.js'
import { UNUSED_WHY } from './scenarioUnused.js'

export const YES_LINE = 'race_phrase_yes'   // pitrace/racePhraseVoice.js, react(): фраза сказана
export const SHOW_LINE = 'race_phrases_show' // pitrace/raceStagesPhrases.js: реплика плашки этапа фраз, когда есть пример (без примера — DEMO_GO)
export const DONE_LINES = { gold: 'race_done_gold', usual: 'race_done' } // pitrace/useRaceActs.js: реплика итога

const MIA_WHO = Object.fromEntries(MIA_LINES.map(l => [l.id, l.who]))
export const whoOf = id => MIA_WHO[id] ?? 'pit'
const item = (x, note = '') => (typeof x === 'string' ? { id: x, who: whoOf(x), note } : { id: x.id, who: x.who ?? whoOf(x.id), note: note || (x.word ? 'и сразу верное слово' : '') })
const part = (key, title, kind, list, o = {}) => ({ key, title, kind, note: o.note ?? '', alt: !!o.alt, items: list.map(x => (x.note != null && x.who ? x : item(x))), ...(o.cues ? { cues: o.cues } : {}), ...(o.stage ? { stage: o.stage } : {}) })
const uniq = list => [...new Set(list)]
const annLines = (stages, act) => stages.filter(s => s.act === act && s.type === 'announce' && !s.mia && s.line).map(s => s.line)
const base = id => id.replace(/_\d+$/, '')

/** Группы «одна из»: реплики с общим началом (mia_ok_1…3) — варианты, одиночные — сами по себе. → [[id…]] в порядке появления */
function groups(ids) {
  const by = new Map()
  for (const id of ids) { const k = base(id); by.set(k, uniq([...(by.get(k) ?? []), id])) }
  return [...by.values()]
}

/** Реплики хода по местам: что звучит первым, вторым, третьим (на разных словах — разные варианты) → [[cue…] на каждое место] */
function byPlace(turns) {
  const out = []
  turns.forEach(say => say.forEach((c, i) => { out[i] = out[i] ?? []; if (!out[i].some(x => x.id === c.id)) out[i].push(c) }))
  return out
}

/** Названия исходов экзамена (boss/bossTrophies.js: доля собранных трофеев; пороги читаются из игры) */
const EXAM_TITLE = { free: `успех — трофеев ${FREE_PCT} % и больше`, mid: `средний — трофеев от ${MID_PCT} до ${FREE_PCT - 1} %`, stay: `провал — трофеев меньше ${MID_PCT} %` }

/** Исходы конца круга → группы с одинаковыми репликами: [{ title, cues, m, stage, outcome }]. У экзамена исход называет сама машина (m.outcome), у допроса — по числу ошибок */
function outcomes(list) {
  const by = new Map()
  for (const x of list) { const sig = `${x.outcome}:${x.cues.map(c => c.id).join('+')}`; const g = by.get(sig) ?? { ...x, missed: [] }; g.missed.push(x.missed); by.set(sig, g) }
  return [...by.values()].filter(g => g.cues.length).map(g => {
    const a = Math.min(...g.missed), b = Math.max(...g.missed), t = g.total
    const title = EXAM_TITLE[g.outcome] ?? (g.outcome || (b === 0 ? 'все слова названы верно' : a === 0 ? `ошибок не больше ${b} из ${t}` : b === t ? (a === 1 ? 'есть хоть одна ошибка' : `ошибок ${a} и больше из ${t}`) : `ошибок от ${a} до ${b} из ${t}`))
    return { title, cues: g.cues, m: g.m, stage: g.stage, outcome: g.outcome }
  })
}

const BOX_NOTE = { try: 'Мия ушла, Пит пробует выбраться', stuck: 'Пит просит помочь с коробкой', faster: 'коробку тронули один раз', free: 'коробку сняли' }

function miaBlock(stages) {
  const cer = ceremonyCues(stages, 'sprint'), r = roundCues(stages, 'sprint'), ends = outcomes(endCues(stages, 'sprint'))
  const parts = [part('cer', 'Церемония: Мия приходит и забирает Пита', 'seq', cer.cues, { cues: cer.cues, stage: cer.stage?.sid })]
  groups(r.win.flat().map(c => c.id)).forEach((g, i) => parts.push(part(`win${i}`, g.length > 1 ? 'Верный ответ — Мия иногда говорит одну из' : 'Два верных подряд', g.length > 1 ? 'variants' : 'seq', g)))
  byPlace(Object.values(r.fail).flat()).forEach((g, i) => parts.push(part(`fail${i}`, g.length > 1 ? 'Слово ушло — Мия говорит одну из' : 'Слово ушло', g.length > 1 ? 'variants' : 'seq', g)))
  ends.forEach((e, i) => {
    parts.push(part(`end${i}`, `Концовка: ${e.title}`, 'seq', e.cues, { cues: e.cues, stage: e.stage?.sid }))
    const box = boxCues(e.m)
    if (box.length) parts.push(part(`box${i}`, 'Пит остался в коробке: его снимает ученик', 'seq', box.flatMap(b => b.cues.map(c => item(c, BOX_NOTE[b.t] ?? '')))))
  })
  const fb = fallbackCues(stages, 'sprint')
  if (fb.length) parts.push(part('fallback', 'Страховка: круг оборвался без концовки (в обычной игре не звучит)', 'seq', fb, { alt: true }))
  return { key: 'mia', title: 'Допрос у Мии', note: 'Только если в круге забылось два слова и больше, один раз за игру: обычно здесь, после «Конвейера слов»; иначе — после обратного конвейера.', parts, sim: { ceremony: cer, ends, jabs: byPlace(Object.values(r.fail).flat())[0] ?? [] } }
}

function bossBlock(stages) {
  const seen = ceremonyCues(stages, 'boss', true), fresh = ceremonyCues(stages, 'boss', false), r = roundCues(stages, 'boss'), ends = outcomes(endCues(stages, 'boss'))
  const parts = [part('cer', 'Церемония: коробка, шкала и условие', 'seq', seen.cues, { cues: seen.cues, stage: seen.stage?.sid })]
  const other = fresh.cues.filter(c => !seen.cues.some(x => x.id === c.id))
  if (other.length) parts.push(part('cer-new', 'Если Мию в этой игре ещё не видели — Пит начинает иначе', 'seq', other, { alt: true }))
  groups(r.win.flat().map(c => c.id)).forEach((g, i) => parts.push(part(`win${i}`, g.length > 1 ? 'Верный ответ — Мия иногда говорит одну из' : 'Два верных подряд', g.length > 1 ? 'variants' : 'seq', g)))
  const why = Object.keys(FAIL_WHY).map(k => ({ k, first: r.fail[k]?.flat()[0] })).filter(x => x.first)
  const jabs = why.filter((x, i) => why.findIndex(y => y.first.id === x.first.id) === i) // колкость Мии — по причине, а не случайно
  parts.push(part('fail0', 'Слово ушло — колкость Мии по причине, одна из', jabs.length > 1 ? 'branch' : 'seq', jabs.map(x => item(x.first, FAIL_WHY[x.k]))))
  const rest = byPlace(Object.values(r.fail).flat().length ? Object.values(r.fail).flatMap(runs => runs.map(say => say.slice(1))) : []), names = ['Затем Пит подсказывает — одна из (и сразу верное слово)', 'Затем Пит зовёт следующее слово (если оно есть)']
  rest.forEach((g, i) => parts.push(part(`fail${i + 1}`, names[i] ?? 'Затем', g.length > 1 ? 'variants' : 'seq', g)))
  if (r.hold.length) parts.push(part('hold', 'Смена языка между блоками слов', 'seq', r.hold))
  ends.forEach((e, i) => parts.push(part(`end${i}`, `Концовка: ${e.title}`, 'seq', e.cues, { cues: e.cues, stage: e.stage?.sid })))
  return { key: 'boss', title: 'Экзамен «Шкала памяти»', note: 'Исход зависит от доли собранных трофеев: за слово в зелёной зоне — все, в жёлтой — половина, в красной — малая часть, за неназванное — ничего.', parts, sim: { ceremony: seen, ceremonyNew: fresh, fail: [jabs.map(x => x.first), ...rest], ends } }
}

/** Сценарий на сейчас. Собирается один раз (код игры за время работы страницы не меняется) */
export function buildScenario() {
  const voice = gameStages(false), tap = gameStages(true)
  const tapOnly = act => annLines(tap, act).filter(id => !annLines(voice, act).includes(id))
  const tapPart = (act, extra = []) => { const ids = uniq([...tapOnly(act), ...extra]); return ids.length ? [part('tap', 'Режим «Пальцами» (вместо реплик выше)', 'seq', ids, { alt: true })] : [] }
  const phr = annLines(voice, 'phrases'), head = phr.includes(SHOW_LINE) ? phr.filter(id => id !== DEMO_GO) : [SHOW_LINE] // без примера (нет озвучки слов запасной фразы) плашка сразу говорит DEMO_GO — он стоит ниже, в примере
  const mia = miaBlock(voice), boss = bossBlock(voice), rev = annLines(voice, 'catch')
  const blocks = [
    { key: 'start', title: 'Старт', note: '', parts: [part('line', 'Первая реплика игры', 'seq', [raceStartId(false)]), part('tap', 'Режим «Пальцами» (вместо неё)', 'seq', [raceStartId(true)], { alt: true })] },
    { key: 'sprint', title: 'Конвейер слов', note: 'Слова и переводы говорит диктор (библиотека слов урока) — они проверяются не здесь.', parts: [...(annLines(voice, 'sprint').length ? [part('ann', 'Начало круга', 'seq', annLines(voice, 'sprint'))] : []), part('good', 'Похвала за верное слово — случайно одна из', 'variants', GOOD_IDS), ...tapPart('sprint')] },
    { key: mia.key, title: mia.title, note: mia.note, parts: mia.parts },
    { key: 'turn', title: 'Разворот и обратный конвейер', note: '', parts: [
      part('ann', 'Пит объявляет разворот (пилюли разворачиваются под его слова) — одна из', 'branch', [...rev.map(id => item(id, 'обычно')), item(REV_LINE_AFTER_MIA, 'если перед разворотом ученик победил Мию')]),
      part('good', 'Похвала за верный перевод', OK_IDS.length > 1 ? 'variants' : 'seq', OK_IDS), ...tapPart('catch')] },
    { key: 'phrases', title: 'Фразы — круг «Скажи»', note: 'Круг «Пойми · Тапни фразу» вырезан: этап начинается сразу с круга «Скажи».', parts: [
      part('ann', 'Плашка этапа: Пит зовёт смотреть пример', 'seq', head),
      part('demo', 'Пример Пита на живой пилюле (между репликами он называет слова фразы)', 'seq', [...DEMO_LINES.map((id, i) => item(id, `перед словом ${i + 1}`)), item(DEMO_MORE, 'только если во фразе больше трёх слов'), item(DEMO_GO, 'после примера; без примера — на плашке этапа')]),
      part('turn', 'Ход игрока', 'seq', [item(AGAIN_LINE, 'перед вторым проходом той же фразы')]),
      part('res', 'Итог хода — одна из', 'branch', [item(YES_LINE, 'фраза сказана'), item(PAUSES_LINE, 'сказана, но с паузами')]),
      part('slip', 'Слово сказано неточно: «слово» + слово по-английски + одна из двух', 'seq', [item(SLIP_WORD_LINE), item(SLIP_RETRY_LINE, 'первая неточность'), item(SLIP_NEXT_LINE, 'вторая неточность')]),
      ...tapPart('phrases'),
    ] },
    { key: boss.key, title: boss.title, note: boss.note, parts: boss.parts },
    { key: 'summary', title: 'Итог', note: 'Если Пит остался в коробке после экзамена, обычная реплика итога не звучит.', parts: [part('line', 'Реплика итога — одна из', 'branch', [item(DONE_LINES.gold, 'золото во всех раундах'), item(DONE_LINES.usual, 'обычный итог')])] },
  ]
  const ids = new Set()
  for (const b of blocks) for (const p of b.parts) for (const x of p.items) { if (ids.has(x.id)) x.again = true; else ids.add(x.id) }
  const unused = [...RACE_LINE_SET].filter(id => !ids.has(id)).map(id => ({ id, who: whoOf(id), why: UNUSED_WHY[id] ?? '' }))
  return { blocks, unused, ids, sim: { stages: voice, mia: mia.sim, boss: boss.sim } }
}

let cached = null
export const scenarioNow = () => (cached ??= buildScenario())
/** id реплик, которые звучат в игре (все ветки) */
export const scenarioIds = () => scenarioNow().ids
