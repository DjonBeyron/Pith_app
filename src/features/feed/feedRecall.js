import { splitTitleTokens, wordTranslation } from '../../shared/lib/titleWords.js'
import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { reviewOutcome } from '../../shared/lib/memory/reviewOutcome.js'
import { levelOf } from '../learn/memoryLadder.js'

// Повторение слова ВНУТРИ перевода по словам в ленте (PROJECT.md → «Лента»,
// макет frazy-pomnish.html, утверждено 2026-10-01). Чистые функции без React:
//   — какое слово фразы «дышит» (срок сегодня);
//   — лимиты показа (3 в день, не чаще раза в 5 видео);
//   — три варианта перевода для проверки;
//   — исход ответа и то, что показать на плашке.
// Ответ — тот же исход в память, что и у карточки колоды: source 'feed', бюджет дня,
// без XP и серии.
const KEY = 'pithy_feed_recall_v1'
export const RECALL_PER_DAY = 3
export const RECALL_GAP = 5 // не чаще раза в 5 видео

// Цвет ступени: небесный / жёлтый / салатовый / фиолетовый (постоянная память) — как во вкладке «Память»
export const LEVEL_COLOR = { 1: '#4fb3ee', 2: '#e2cd78', 3: '#b6fe3b', P: '#a78bfa' }

// Слова к повтору сегодня — из выбора дня (вне отпуска, в пределах остатка бюджета, слово с колодой):
// { due: Map слово → { step, due } } или null, если сегодня повторять нечего
export function recallView(view) {
  if (!view || view.vacation) return null
  const picked = view.today?.picked ?? []
  if (!picked.length) return null
  return { due: new Map(picked.map(p => [p.word, { step: p.step, due: view.dueOf?.get(p.word) ?? '' }])) }
}

// Слово фразы, про которое спросим: со сроком «сегодня» и с переводом (без него нечем проверить).
// Слов несколько — самое актуальное: срок раньше, при равенстве слабее (меньше шаг); нет такого — null
export function pickRecallWord(title, entries, rv) {
  if (!rv) return null
  const found = []
  for (const t of splitTitleTokens(title)) {
    if (!t.word) continue
    const key = wordKey(t.text)
    const d = key && rv.due.get(key)
    const tr = d ? wordTranslation(entries, t.text, t.index).trim() : ''
    if (!d || !tr || found.some(f => f.key === key)) continue
    found.push({ key, index: t.index, text: t.text, tr, step: d.step, due: d.due })
  }
  found.sort((a, b) => a.due.localeCompare(b.due) || a.step - b.step || a.index - b.index)
  return found[0] ?? null
}

// Все переводы слов модулей ленты — запас «чужих» вариантов для проверки
export function translationPool(modules) {
  const out = new Set()
  for (const m of modules ?? []) {
    for (const e of Array.isArray(m.wordTranslations) ? m.wordTranslations : []) {
      const t = (e?.t ?? '').trim()
      if (t) out.add(t)
    }
  }
  return [...out]
}

const norm = s => String(s).trim().toLocaleLowerCase()

// Верный перевод + два чужих из запаса, вперемешку. Чужих меньше двух — null (молчим)
export function quizOptions(correct, pool, rand = Math.random) {
  const seen = new Set([norm(correct)])
  const others = []
  for (const p of pool ?? []) {
    const k = norm(p)
    if (!k || seen.has(k)) continue
    seen.add(k)
    others.push(p)
  }
  if (others.length < 2) return null
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[others[i], others[j]] = [others[j], others[i]]
  }
  const options = others.slice(0, 2)
  options.splice(Math.floor(rand() * 3), 0, correct)
  return options
}

// Исход одного ответа: второй попытки нет, поэтому ошибка — again (−1), а не fail (−2).
// Верно: быстро — good (+1), дольше порога карточек — hard (шаг тот же)
export const recallOutcome = (isRight, timeMs) =>
  (isRight ? reviewOutcome([{ cardId: null, result: 'correct', timeMs }]) : 'again')

// Состояние плашки по исходу: ok — галочка и салют, hard — серая галочка, bad — без галочки
export const recallState = outcome => (outcome === 'good' ? 'ok' : outcome === 'hard' ? 'hard' : 'bad')

// Что показать, когда ответ сервера известен (res — ответ reviewWord, null — не дошёл: считаем сами).
// from — шаг до ответа (как на экране), to — после, perm — слово теперь в постоянной памяти
export function recallResult({ outcome, step, wasSettled, res }) {
  if (res?.ok) return { from: step, to: res.step, perm: !!res.settled_on }
  if (outcome === 'again') return { from: step, to: Math.max(1, step - 1), perm: false }
  if (outcome === 'hard') return { from: step, to: step, perm: wasSettled }
  return { from: step, to: Math.min(5, step + 1), perm: step >= 5 }
}

// Цвет плашки и линии: до ответа — ступень слова, после — ступень, в которую оно пришло
export function recallColor(r) {
  if (!r) return null
  if (r.phase === 'quiz') return LEVEL_COLOR[r.wasSettled ? 'P' : levelOf(r.step)]
  if (r.perm) return LEVEL_COLOR.P
  return LEVEL_COLOR[levelOf(r.to ?? r.step)]
}

// Сколько результат висит на экране (мс): ok дольше; сменилась ступень — ждём, пока доедет полоска слова
export function recallHoldMs(r) {
  const levelChanged = !!r.perm !== !!r.wasSettled || levelOf(r.to ?? r.step) !== levelOf(r.from ?? r.step)
  if (levelChanged) return 5600
  return r.phase === 'ok' ? 3400 : 3000
}

// ── Лимиты показа: сколько раз за день уже предложили ──────────────────
export function shownToday(today) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return s?.date === today ? s.count : 0
  } catch { return 0 }
}

export function markShown(today) {
  try { localStorage.setItem(KEY, JSON.stringify({ date: today, count: shownToday(today) + 1 })) } catch { /* приватный режим */ }
}

// Можно ли предложить сейчас: прошло ≥ 5 видео с прошлого раза и дневной лимит не выбран
export const canOffer = ({ swipes, shown }) => swipes >= RECALL_GAP && shown < RECALL_PER_DAY
