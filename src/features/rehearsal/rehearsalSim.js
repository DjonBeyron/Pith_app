// Симуляция памяти и XP «Репетиции» (CONCEPT_REHEARSAL.md §3, «XP и память»): по журналу актов (rehearsalJournal) считает итог сессии и пишет его в память сессии браузера (sessionStorage) и в журнал отладки.
// Никаких запросов на сервер: позже эту запись заменит RPC вкладки «Память» (слова — due_on и шаг лесенки, фраза — consolidated_at). Чистая часть (scoreSession) отдельно от записи (applySession).
//  • +1 XP за слово «к повтору», сказанное верно в акте 1 или 4; потолок в день общий с «Скажи вслух» (XP_DAILY_CAP);
//  • слово с промахом → due_on = завтра, шаг не меняется; без промахов → следующий шаг лесенки;
//  • фраза → consolidated_at = сегодня, но не чаще раза в PHRASE_GAP_DAYS дней;
//  • зеркало (акт 5): темп дубля и ОДНА заметка Пита (note: { key, text }) идут в итог и в запись фразы (lastTempo / lastNote — для вкладки «Память» позже) и в журнал отладки.
import { pLog } from '../../shared/lib/debug.js'
import { warmupWords } from './rehearsalPlan.js'
import { cleanOf, winsOf, badOf } from './rehearsalJournal.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const SIM_KEY = 'pithy_rehearsal_sim_v1'
export const XP_DAILY_CAP = 10
export const PHRASE_GAP_DAYS = 3
export const LADDER_DAYS = [1, 3, 7, 14, 30]   // через сколько дней слово вернётся на шаге лесенки (шаг растёт после чистого прохода)

const DAY_MS = 86400000
export const dayKey = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const addDays = (now, k) => dayKey(now + k * DAY_MS)

/** Ключ слов-ступеней разминки в журнале: warmup-0, warmup-1… (у одного слова — word-0) */
export const warmupSid = (plan, i) => `${plan.chunks.length === 1 ? 'word' : 'warmup'}-${i}`

/** Чистый подсчёт: { xp (до потолка), words: [{ text, hit, miss }], phraseDone, misses } — hit/miss: сколько раз слово сказано верно / с промахом (акты 1 и 4) */
export function scoreSession(plan, journal) {
  const warm = warmupWords(plan)
  const blind = ['blind-0', 'blind-1'].filter(sid => journal.stages[sid])
  const blindOk = blind.length > 0 && blind.every(sid => cleanOf(journal, sid))
  const blindBad = blind.some(sid => badOf(journal, sid) > 0)
  const due = plan.words.filter(w => w.due)
  const list = [...plan.words, ...warm.filter(w => !plan.words.some(p => normText(p.text) === normText(w.text)))]
  const words = list.map(w => {
    const wi = warm.findIndex(x => normText(x.text) === normText(w.text))
    const sid = wi >= 0 ? warmupSid(plan, wi) : null
    const inWarm = sid && journal.stages[sid]
    const hit = (inWarm && cleanOf(journal, sid) ? 1 : 0) + (blindOk ? 1 : 0)
    const miss = (inWarm && !cleanOf(journal, sid) && (badOf(journal, sid) > 0 || winsOf(journal, sid) === 0) ? 1 : 0) + (blindBad ? 1 : 0)
    return { text: w.text, hit, miss }
  })
  const xp = due.filter(w => words.find(x => x.text === w.text)?.hit > 0).length
  const phraseDone = winsOf(journal, 'take') > 0 || blind.some(sid => winsOf(journal, sid) > 0)
  const misses = Object.values(journal.stages).reduce((a, x) => a + x.miss + x.fail, 0)
  return { xp, words, phraseDone, misses }
}

const empty = () => ({ xpDay: '', xpToday: 0, words: {}, phrases: {} })

export function loadSim(store = globalThis.sessionStorage) {
  try { const v = JSON.parse(store?.getItem(SIM_KEY) ?? 'null'); return v && typeof v === 'object' ? { ...empty(), ...v } : empty() } catch { return empty() }
}
function saveSim(sim, store) { try { store?.setItem(SIM_KEY, JSON.stringify(sim)) } catch { /* приватный режим — симуляция живёт до перезагрузки */ } }

/** Запись итога в память сессии: XP с потолком дня, слова (шаг и due_on), фраза (consolidated_at; mirror — темп и заметка дубля). → { xp (начислено), capped, words, phraseDone, consolidated, tempo, note } */
export function applySession(plan, score, { store = globalThis.sessionStorage, now = Date.now(), mirror = null } = {}) {
  const sim = loadSim(store)
  const today = dayKey(now)
  if (sim.xpDay !== today) { sim.xpDay = today; sim.xpToday = 0 }
  const room = Math.max(0, XP_DAILY_CAP - sim.xpToday)
  const xp = Math.min(score.xp, room)
  sim.xpToday += xp
  for (const w of score.words) {
    const prev = sim.words[w.text] ?? { step: 0 }
    const bad = w.miss > 0 || w.hit === 0
    const step = bad ? prev.step : Math.min(prev.step + 1, LADDER_DAYS.length - 1)
    sim.words[w.text] = { step, dueOn: bad ? addDays(now, 1) : addDays(now, LADDER_DAYS[step]), lastAt: today }
  }
  const prevPhrase = sim.phrases[plan.phrase]
  const gapOk = !prevPhrase?.consolidatedAt || Date.parse(today) - Date.parse(prevPhrase.consolidatedAt) >= PHRASE_GAP_DAYS * DAY_MS
  const consolidated = score.phraseDone && gapOk
  const tempo = mirror?.tempo ?? null
  const note = mirror?.note ?? null
  if (consolidated || note) sim.phrases[plan.phrase] = { ...(prevPhrase ?? {}), ...(consolidated ? { consolidatedAt: today } : {}), ...(note ? { lastTempo: tempo, lastNote: note.key } : {}) }
  saveSim(sim, store)
  return { xp, capped: xp < score.xp, words: score.words, phraseDone: score.phraseDone, consolidated, tempo, note }
}

/** Итог сессии одним вызовом: подсчёт → запись в sessionStorage → строка в журнал отладки. Вызывает хук useRehearsalActs при выходе на итог */
export function reportSession({ plan, journal, mirror = null, store, now, log = pLog }) {
  const score = scoreSession(plan, journal)
  const res = { ...applySession(plan, score, { store, now, mirror }), misses: score.misses }
  log(`[rehearsal] итог «${plan.phrase}»: XP +${res.xp}${res.capped ? ' (потолок дня)' : ''}, слова ${res.words.map(w => `${w.text} ${w.hit}/${w.miss}`).join(', ') || '—'}, фраза ${res.phraseDone ? 'готова' : 'не готова'}, промахов ${res.misses}, темп ${res.tempo ?? '—'}, заметка Пита: ${res.note ? `[${res.note.key}] ${res.note.text}` : '—'}`)
  return res
}
