import { queueStep, MIA_ANN_MS, MIA_WAIT_CAP_MS } from '../raceStageKit.js'
import { goodPlan } from '../raceGood.js'
import { BOSS_SPEED } from './bossWords.js'
import { BOSS } from '../mia/raceMia.js'
import { SWITCH_MS } from '../raceSwitch.js'

export const BOSS_WAIT_CAP_MS = 70000 // страховка: три ноты ждут конца объяснения не дольше (Пит и «помолчи» ≈ 8 с, пример 15,75 с, последние реплики ≈ 8 с)
export const BOSS_END_MS = 11000 // эпилог финала держится столько (реплики Мии и Пита, уход Мии с коробкой)

// Финал «Шкала памяти» (CONCEPT_RACE.md, «Финал»; владелец 2026-11-14) → стадии акта boss. Проводит Мия (эпизод mia/raceMia.js): церемония `boss-ann` (коробка падает на Пита, Мия запрыгивает,
// Пит начинает репликой pit_forgot, три ноты — после речи Мии) и круг `boss`: слова — слабые слова этой игры (bossWords.js, вписывает директор перед входом), по одному на одной широкой ленте по центру,
// пилюля с русским переводом, Пит в коробке говорит перевод, ученик называет слово по-английски (та же механика, что проход A). Справа шкала времени реакции, через всю ленту идёт горизонтальная
// линия, её толкает пилюля (RaceBossScale.jsx). Слова без фраз. Только голосом (в «Тапаю» финала нет). Стадии помечены mia: результаты редюсер гонки не считает, ускорения (boost) нет, Мия по серии не уходит.
export function bossStages(kit, act, o = {}) {
  const { push, announce, plan } = kit
  const words = act.words.map((w, idx) => ({ ...w, idx, lane: 1, speed: BOSS_SPEED }))
  announce(act, { sid: 'boss', title: '', task: '', line: null, ms: MIA_ANN_MS })
  Object.assign(kit.stages.at(-1), { mia: 'ann', always: true, waitCap: BOSS_WAIT_CAP_MS, script: 'boss', demoRun: true, dropAt: BOSS.DROP_AT, jumpAt: BOSS.JUMP }) // свой сценарий (boss_*): коробка падает почти сразу, Мия прыгает после реплик Пита и её из-за края
  // Блок слов: ru — пилюля с английским словом, ученик называет русское (русская модель Vosk), иначе пилюля с переводом, ученик называет английское слово; offset — номер первого слова блока в общем счёте (машина Мии)
  const round = (list, b = {}) => {
    const sid = b.sid ?? 'boss', ru = !!b.ru, good = goodPlan(plan.seed, sid, list.length, { first: !b.offset })
    const rep = ru ? w => ({ cap: w.text, say: w.text }) : w => ({ cap: w.translation, say: w.translation })
    return { type: 'student', act: act.id, sid, mia: 'round', noBoost: true, noLeave: true, silent: true, ...(ru ? { always: true } : {}), offset: b.offset ?? 0, words: list, good, step: { ...queueStep(kit, sid, list, good, rep, ru ? { target: w => w.translation, lang: 'ru' } : {}), wide: true, overlap: false } }
  }
  const split = o.voice && words.length >= 2 // финал-экзамен: половина слов — английские (ответ по-английски), половина — русские (ответ по-русски); русской модели нет — все английские
  const k = split ? Math.ceil(words.length / 2) : words.length
  push({ ...round(words.slice(0, k)), base: words, fill: list => { // директор вписывает слова этой игры: с русским блоком — пополам (первая половина английская), без него — все английские
    const b = kit.stages.find(x => x.sid === 'boss2'), n = b && list.length >= 2 ? Math.ceil(list.length / 2) : list.length
    Object.assign(kit.stages.find(x => x.sid === 'boss'), round(list.slice(0, n)))
    if (b) { const rest = list.slice(n); Object.assign(b, round(rest, { sid: 'boss2', ru: true, offset: n })); b.empty = !rest.length }
  } })
  if (split) {
    push({ type: 'announce', act: act.id, sid: 'boss-sw', switchTo: 'ru', mia: 'hold', always: true, count: false, say: 'boss_mia_ru', round: { kind: 'switch', title: 'Секунду', task: 'переключаю слух', brief: 'переключаю слух' }, ms: SWITCH_MS, line: null }) // между блоками: слух → русская модель; Мия объясняет, что теперь наоборот
    const rest = words.slice(k)
    push({ ...round(rest, { sid: 'boss2', ru: true, offset: k }), demote() { const st = kit.stages.find(x => x.sid === 'boss2'); Object.assign(st, round(st.words, { sid: 'boss2', offset: st.offset })) } }) // русская модель не загрузилась: блок идёт по-английски
  }
  push({ type: 'announce', act: act.id, sid: 'boss-end', mia: 'end', always: true, round: { kind: 'mia', title: '', task: '' }, line: null, ms: BOSS_END_MS }) // эпилог: Мия и Пит договаривают на сцене с коробкой, потом итог
}
