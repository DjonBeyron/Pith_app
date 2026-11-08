// Стенд итога «Встряхни память» (?only=summary в _stand/race/index.html): экран итога (RaceSummary.jsx) сразу, без прохождения этапов — фикстура результата со словами, метриками и слабыми фразами
// внутри той же обёртки, что у игры (.wl[data-race] → .wlStage[data-tex] с узором сцены, race-stage-bg.css): видно, просвечивает ли узор сквозь подложки карточек. Только для снимков, в сборку не входит.
import React from 'react'
import RaceSummary from '/src/features/pitrace/RaceSummary.jsx'
import { weakWords } from '/src/features/pitrace/raceWeak.js'
import { withAccuracy } from '/src/features/pitrace/raceAccuracy.js'
import { fixturePlan } from '/src/features/rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '/src/features/rehearsal/rehearsalPlan.js'

const ok = (ms, o = {}) => ({ hit: true, miss: false, ms, life: 4000, fill: 0.85, ...o }), bad = { hit: false, miss: true }
const race = {
  sprint: { words: ['nice', 'meet', 'learn', 'trying'], caps: { nice: 'приятно', meet: 'встретить', learn: 'учить', trying: 'пытаюсь' }, results: { 0: ok(900), 1: bad, 2: ok(2100), 3: ok(1400, { miss: true }) }, r2: null },
  catch: { words: ['you', 'from', 'where'], caps: { you: 'ты', from: 'из', where: 'где' }, traps: [false, true, false], results: { 0: ok(600), 1: bad, 2: { hit: false, miss: false } }, r2: null },
}
const phrases = [
  { key: 'a', text: 'Nice to meet you', ru: 'приятно познакомиться', weak: true, r1: { ok: false, confusedText: 'Where are you from' }, r2: { ok: true, clean: true } },
  { key: 'b', text: "I'm trying to learn", ru: 'я пытаюсь учиться', weak: true, r1: { ok: true, late: true }, r2: { ok: false } },
]
const metrics = { accuracy: { sprint: { hit: 3, total: 4 }, catch: { hit: 1, total: 3 } }, avgMs: 1250, slowest: { text: 'learn', ms: 2100 }, traps: { dodged: 0, total: 1 } }
const result = { sprint: { hit: 3, total: 4 }, catchOk: 1, catchTotal: 3, phrasesOk: 2, phrasesTotal: 4, phrases, medal: 'none', descent: null, xp: 12, capped: false, gold: false, metrics, weak: withAccuracy(race, weakWords(race, Infinity)) }

/** Элемент стенда итога: обёртка игры с узором и экран итога поверх */
export function summaryStand() {
  const plan = normalizePlan({ ...fixturePlan('three'), game: 'race', round: 'stages' })
  const summary = React.createElement(RaceSummary, { plan, result, onAgain: () => {}, onDone: () => { window.__done = 'summary' } })
  const stage = React.createElement('div', { className: 'wlStage', 'data-tex': '' }, summary)
  return React.createElement('div', { className: 'wl', 'data-race': '', 'data-testid': 'wl' }, stage)
}
