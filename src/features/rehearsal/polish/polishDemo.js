// «Шлифовка репетиции → Итог»: экран итога без настоящей репетиции. Результат ПОДСТАВНОЙ — журнал актов «всё сказано верно, один промах в сборке», темп дубля ×1.3 и заметка Пита-пример; запись симуляции памяти уходит в
// «пустое» хранилище (store), поэтому настоящая память сессии (sessionStorage, rehearsalSim.js) от шлифовки экрана не меняется. Чистая функция — проверяется тестами.
import { createJournal, record } from '../rehearsalJournal.js'
import { warmupSid } from '../rehearsalSim.js'
import { warmupWords } from '../rehearsalPlan.js'

export const DEMO_TEMPO = 1.3
export const DEMO_NOTE = { key: 'demo', text: 'Пример заметки Пита: фраза звучит ровно, держи паузу перед последним куском.' }

/** Хранилище-пустышка: читает «ничего», пишет в никуда */
export const nullStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

/** → { journal, mirror, store } для reportSession: слова разминки сказаны верно, «без текста» и дубль приняты, одно слово промахнулось в сборке */
export function demoSummary(plan) {
  const journal = createJournal()
  const win = (sid, act, n = 1) => { for (let i = 0; i < n; i++) record(journal, { sid, act }, 'win') }
  warmupWords(plan).forEach((_, i) => win(warmupSid(plan, i), plan.chunks.length === 1 ? 'word' : 'warmup'))
  record(journal, { sid: 'build-0', act: 'build' }, 'miss')
  win('build-0', 'build'); win('blind-0', 'blind', plan.chunks.length); win('take', 'take', plan.chunks.length)
  return { journal, mirror: { tempo: DEMO_TEMPO, note: DEMO_NOTE }, store: nullStore }
}
