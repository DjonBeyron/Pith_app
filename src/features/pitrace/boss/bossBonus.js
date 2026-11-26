// Бонус-круг экзамена «Шкала памяти» (владелец 2026-11-26: «если пользователь всё ответил верно и в зелёной зоне, Мия говорит: раз для тебя это просто, я ускоряю игру, и все слова идут снова
// в рандомном порядке на этом же языке детекции и с ускорением, где последние три слова прям реально быстро идут, чтобы система могла успеть это считать»). Чистые функции без React и DOM.
//  • условие — bossMia.examPerfect: все слова экзамена верны и каждое в зелёной зоне; иначе экзамен кончается, как раньше (три исхода);
//  • ход — стадия-реплика BONUS_ANN_SID (Мия: BONUS_LINE; плашки и трёх нот нет, шкала и Мия на коробке остаются) → круг BONUS_SID: все слова экзамена заново → обычная концовка;
//  • язык — тот, на котором шёл ПОСЛЕДНИЙ блок экзамена (модель Vosk не переключается): обычно русский — на пилюле английское слово, ответ по-русски, и слова первого блока спрашиваются так же;
//    русской модели нет — весь экзамен английский, бонус тоже (на пилюле перевод, ответ по-английски);
//  • порядок — случайный по семени плана, не как в экзамене, и первое слово бонуса — не последнее слово экзамена;
//  • скорость — каждое слово быстрее предыдущего, последние BONUS_LAST — резко быстрее, но не быстрее, чем слово можно успеть сказать и распознать (kMax);
//  • в бонус-круге Пит и Мия молчат (bossMia.bonusRound, useRaceActs.pre): только пилюля и линия шкалы.
import { rngFor, rngShuffle } from '../../rehearsal/rehearsalSeed.js'
import { SPEED, LISTEN_Y_MIN } from '../../player/modules/rotate-phone/wordLaneTimeline.js'
import { FAIL_Y } from '../../player/modules/rotate-phone/wordLaneStudent.js'
import { QUIET_MS, syllables } from '../../player/modules/rotate-phone/wordEarRule.js'
import { BOSS_SPEED } from './bossWords.js'
import { examPerfect } from './bossMia.js'

export const BONUS_ANN_SID = 'boss-fast-ann' // стадия-реплика Мии перед бонус-кругом
export const BONUS_SID = 'boss-fast'         // сам бонус-круг
export const BONUS_LINE = 'boss_mia_fast'    // «раз для тебя это просто, я ускоряю игру»
export const BONUS_ANN_MS = 400              // минимум стадии-реплики; на деле её держит длина реплики Мии (useRaceActs.holdMs, стадия mia 'hold')
export const BONUS_MIN = 3                   // слов в бонус-круге не меньше (как в экзамене, bossWords.BOSS_MIN): иначе бонуса нет

// ── СКОРОСТЬ БОНУС-КРУГА. ПРЕДЛОЖЕНИЕ, владелец может поменять: все числа скорости — здесь. Множитель K — во сколько раз пилюля быстрее пилюли экзамена (экзамен: BOSS_SPEED 0,5 конвейера ≈ 13 %
// высоты в секунду). Для сравнения: «Конвейер слов» идёт на K 2,0–2,55, «Допрос у Мии» (×1,15) — на K 2,3–2,94: последние три слова бонуса быстрее всего, что есть в игре.
// Окно ответа — время, пока пилюля слушает (от «видна на 90 %» до «не успел»): 88 % высоты экрана; при K = 1 это 6769 мс, при множителе K — 6769 / K мс.
export const BONUS_K_FIRST = 1.3      // первое слово бонуса: окно 5207 мс
export const BONUS_K_STEP = 0.3       // каждое следующее слово разгона быстрее на столько: 1,3 → 1,6 → 1,9 (окна 5207 → 4231 → 3563 мс)
export const BONUS_LAST = 3           // сколько последних слов идут «прям реально быстро»
export const BONUS_K_LAST_FROM = 2.8  // первое из последних: окно 2418 мс (уровень самой быстрой пилюли «Допроса»)
export const BONUS_K_LAST_STEP = 0.5  // 2,8 → 3,3 → 3,8: окна 2418 → 2051 → 1781 мс; последняя пилюля проезжает экран за ≈ 2,2 с
// ── НИЖНЯЯ ГРАНИЦА окна ответа («чтобы система могла успеть это считать»): минимум M = увидеть слово и начать говорить + произнести его + тишина, после которой слушатель просит итог + итог Vosk.
// Расчёт для самого быстрого слова: при множителе ×3,8 окно ответа 1781 мс ≥ минимум 1630 мс для ответа в два слога (700 + 2 × 180 + 220 + 350). Ответ в три слога требует 1810 мс — его
// множитель сам ограничивается до ×3,73, в пять слогов (2170 мс) — до ×3,11 (kMax: функция, не константа). Источники чисел: слог и тишина — wordEarRule.js («быстрая речь ≈ 150–180 мс на слог»,
// QUIET_MS 220 мс до запроса итога); от начала голоса до зачёта на iPhone владельца 549–698 мс (bossAnswer.js, журнал v3.3.339) — отсюда запас на итог 350 мс; реакция 700 мс — оценка.
// Живым голосом и настоящим Vosk на этой скорости НЕ проверено: если слова не успевают засчитываться — уменьшить BONUS_K_LAST_FROM / BONUS_K_LAST_STEP или поднять BONUS_REACT_MS.
export const BONUS_REACT_MS = 700     // увидеть слово на пилюле и начать говорить
export const BONUS_SYL_MS = 180       // длительность слога в быстрой речи
export const BONUS_FINAL_MS = 350     // запас на итог Vosk после тишины QUIET_MS

/** Окно ответа, мс: сколько пилюля со скоростью speed (доли конвейера) слушает — от LISTEN_Y_MIN (видно 90 % её высоты) до FAIL_Y («не успел») */
export const windowMs = speed => Math.round(((FAIL_Y - LISTEN_Y_MIN) / (SPEED * (speed > 0 ? speed : 1))) * 1000)
/** Минимальное окно, в которое ответ target (то, что нужно СКАЗАТЬ) успевает прозвучать и распознаться, мс */
export const minWindowMs = (target, lang = 'en') => BONUS_REACT_MS + Math.max(1, syllables(target, lang)) * BONUS_SYL_MS + QUIET_MS + BONUS_FINAL_MS
/** Наибольший множитель для ответа target: быстрее — окно меньше минимума. Не ниже 1 (скорость экзамена) */
export const kMax = (target, lang = 'en') => Math.max(1, Math.floor((windowMs(BOSS_SPEED) / minWindowMs(target, lang)) * 100) / 100)

/** Ступени скорости для круга из n слов (без поправки на длину слова): разгон от BONUS_K_FIRST шагом BONUS_K_STEP, последние BONUS_LAST — от BONUS_K_LAST_FROM шагом BONUS_K_LAST_STEP */
export function bonusSteps(n) {
  const ramp = Math.max(0, n - BONUS_LAST), step = Math.min(BONUS_K_STEP, (BONUS_K_LAST_FROM - BONUS_K_FIRST) / (ramp + 1)) // слов много — разгон делится ровно, до скорости последних трёх не доходит
  return Array.from({ length: n }, (_, i) => +(i < ramp ? BONUS_K_FIRST + i * step : BONUS_K_LAST_FROM + (i - ramp) * BONUS_K_LAST_STEP).toFixed(2))
}

/** Что ученик говорит в ответ на слово w и можно ли его спросить на языке блока: по-русски — нужен перевод с русскими буквами (иначе русской модели нечего слушать), по-английски — само слово */
export const bonusTarget = (w, ru) => (ru ? (/[а-яё]/i.test(w?.translation ?? '') ? w.translation : '') : w?.text ?? '')

/** Порядок бонус-круга: случайный по семени; не совпадает с порядком экзамена, и первое слово — не последнее слово экзамена (одно слово не идёт дважды подряд на стыке). Запасной путь — сдвиг на одно слово */
export function bonusOrder(words, seed) {
  const rng = rngFor(seed, 'race-boss-bonus'), same = list => list.every((w, i) => w === words[i])
  for (let n = 0; n < 24 && words.length > 1; n++) { const list = rngShuffle(rng, words); if (!same(list) && (words.length < 3 || list[0] !== words.at(-1))) return list }
  return words.length > 1 ? [...words.slice(1), words[0]] : [...words]
}

/** Слова бонус-круга из слов экзамена words (в порядке экзамена): → { list: [{ ...слово, idx, lane, speed, k, win }], skipped: [слова, которые на этом языке спросить нельзя] }; k — множитель, win — окно ответа, мс */
export function bonusWords(words, ru, seed) {
  const ok = words.filter(w => bonusTarget(w, ru)), skipped = words.filter(w => !bonusTarget(w, ru)), steps = bonusSteps(ok.length)
  const list = bonusOrder(ok, seed).map((w, idx) => { const k = Math.min(steps[idx], kMax(bonusTarget(w, ru), ru ? 'ru' : 'en')), speed = +(BOSS_SPEED * k).toFixed(4); return { ...w, idx, lane: 1, speed, k, win: windowMs(speed) } })
  return { list, skipped }
}

const RU_NUM = n => String(n).replace('.', ',')
/**
 * Директор, выбор стадии после последнего блока экзамена: i — стадия, на которую он собрался (nextIdx). Это стадия-реплика бонуса → решаем: условие выполнено — слова вписаны в круг (stage.fill),
 * идём на неё; нет — мимо бонуса, на стадию-конец. Вызывается и «заглядыванием вперёд» (дорожки конвейера), поэтому решение считается заново каждый раз, а слова вписываются один раз (ann.bonusKey).
 * → { idx, log } — log: строка журнала, когда решение изменилось (иначе null)
 */
export function bonusRoute(stages, i, m, seed) {
  const ann = stages[i], round = stages[i + 1]
  if (ann?.sid !== BONUS_ANN_SID || round?.sid !== BONUS_SID) return { idx: i, log: null }
  const end = stages.findIndex((x, j) => j > i && x.sid === 'boss-end'), skip = { idx: end >= 0 ? end : i + 2, log: null }
  const note = text => { const fresh = ann.bonusNote !== text; ann.bonusNote = text; return fresh ? `[exam] ${text}` : null }
  const blocks = stages.slice(0, i).filter(x => x.act === 'boss' && x.mia === 'round' && !x.bonus && !x.empty), ru = blocks.at(-1)?.step?.lang === 'ru', all = blocks.flatMap(x => x.words ?? [])
  const played = Object.keys(m?.won ?? {}).length + Object.keys(m?.dug ?? {}).length
  if (m?.act !== 'boss' || !(m.total > 0) || m.total < all.length || played < m.total) return skip // экзамен ещё идёт (заглядывание вперёд; второй блок ещё не начат) — решать рано
  const green = Array.from({ length: m.total }, (_, k) => k).filter(k => m.won?.[k] && (m.zones?.[k] ?? 'fast') === 'fast').length
  if (!examPerfect(m)) return { ...skip, log: note(`бонус-круга нет: верно названо ${Object.keys(m.won ?? {}).length} из ${m.total}, из них в зелёной зоне ${green} (нужно все ${m.total})`) }
  const { list, skipped } = bonusWords(all, ru, seed)
  if (list.length < BONUS_MIN) return { ...skip, log: note(`бонус-круга нет: на языке последнего блока можно спросить только ${list.length} слов (нужно ${BONUS_MIN})`) }
  const key = `${ru ? 'ru' : 'en'}:${list.map(w => `${w.text}@${w.speed}`).join('|')}`
  if (ann.bonusKey !== key) { ann.bonusKey = key; round.fill(list, ru); if (ru) ann.switchTo = 'ru'; else delete ann.switchTo } // switchTo 'ru' при уже русском слухе ничего не грузит (raceSwitch.forRu) и не даёт вернуть английскую модель на стадии-реплике (useRaceSwitch)
  return { idx: i, log: note(`бонус-круг: все ${m.total} слов названы верно и в зелёной зоне — Мия ускоряет игру; язык ответа ${ru ? 'русский (на пилюле английское слово)' : 'английский (на пилюле перевод)'}, слов ${list.length}${skipped.length ? `, пропущено ${skipped.length} (нет русского перевода): ${skipped.map(w => `«${w.text}»`).join(', ')}` : ''}: ${list.map((w, n) => `${n + 1}) «${w.text}» ×${RU_NUM(w.k)}, окно ${w.win} мс`).join('; ')}`) }
}
