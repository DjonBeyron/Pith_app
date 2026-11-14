import { queueStep, MIA_ANN_MS, MIA_WAIT_CAP_MS } from '../raceStageKit.js'
import { goodPlan } from '../raceGood.js'
import { BOSS_SPEED } from './bossWords.js'

// Финал «Шкала памяти» (CONCEPT_RACE.md, «Финал»; владелец 2026-11-14) → стадии акта boss. Проводит Мия (эпизод mia/raceMia.js): церемония `boss-ann` (коробка падает на Пита, Мия запрыгивает,
// Пит начинает репликой pit_forgot, три ноты — после речи Мии) и круг `boss`: слова — слабые слова этой игры (bossWords.js, вписывает директор перед входом), по одному на одной широкой ленте по центру,
// пилюля с русским переводом, Пит в коробке говорит перевод, ученик называет слово по-английски (та же механика, что проход A). Справа шкала времени реакции, через всю ленту идёт горизонтальная
// линия, её толкает пилюля (RaceBossScale.jsx). Слова без фраз. Только голосом (в «Тапаю» финала нет). Стадии помечены mia: результаты редюсер гонки не считает, ускорения (boost) нет, Мия по серии не уходит.
export function bossStages(kit, act) {
  const { push, announce, plan } = kit
  const words = act.words.map((w, idx) => ({ ...w, idx, lane: 1, speed: BOSS_SPEED }))
  announce(act, { sid: 'boss', ms: MIA_ANN_MS })
  Object.assign(kit.stages.at(-1), { mia: 'ann', always: true, waitCap: MIA_WAIT_CAP_MS })
  const round = list => { const good = goodPlan(plan.seed, 'boss', list.length, { first: true }); return { type: 'student', act: act.id, sid: 'boss', mia: 'round', noBoost: true, noLeave: true, words: list, good, step: { ...queueStep(kit, 'boss', list, good, w => ({ cap: w.translation, say: w.translation })), wide: true, overlap: false } } }
  push({ ...round(words), base: words, fill: list => Object.assign(kit.stages.find(x => x.sid === 'boss'), round(list)) })
}
