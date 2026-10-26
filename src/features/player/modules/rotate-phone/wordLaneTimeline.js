// Раскладка и время вертикальной игры «Повтори за диктором» (RotatePhoneModule). Чистые функции — без React и DOM, проверяются тестами.
// Сцена меряется в ПРОЦЕНТАХ высоты экрана (y — от верха), x — от левого края. Три дорожки — три равные колонки с разделителями; в каждой своя вертикальная пустая пилюля.
// КОНВЕЙЕР: пилюли выкатываются сверху ПОСТОЯННО С ОДНОЙ СКОРОСТЬЮ (SPEED, %/с) и катятся вниз, не останавливаясь и не ускоряясь. Диктор озвучивает слово, пока пилюля проходит
// через середину экрана: слово началось — пилюля в точке ZONE_Y − SPEED·длина/2, слово кончилось — в ZONE_Y + SPEED·длина/2 (середина слова = центр экрана). Пока слово звучит,
// пилюля заливается снизу вверх синхронно с речью; в конце слова щёлкает и катится дальше, уходит за нижний край.
// Фаза ученика — тот же конвейер: пилюли едут сами; ученик должен успеть сказать слово, пока пилюля на экране (wordLaneStudent.js): принято — заливка, щелчок, XP; пилюля ушла вниз
// без слова — «не успел» (она гаснет, и её выкатят снова).

export const SLOT_COUNT = 3
export const LANE_X = [100 / 6, 50, 500 / 6]                // середины дорожек, % ширины
export const LANE_EDGES = [100 / 3, 200 / 3]                // разделители дорожек, % ширины
export const PILL_W = 22                                    // ширина пилюли, % ширины экрана
export const PILL_H = 20                                    // высота пилюли, % высоты экрана
export const WORD_Y = 6                                     // центр слова наверху, % высоты
export const ZONE_Y = 48                                    // центр «зоны голоса» — середина слова диктора приходится на него
export const ENTER_Y = -14                                  // центр пилюли за верхним краем (целиком вне экрана: низ на −4 %)
export const EXIT_Y = 118                                   // и за нижним
export const SPEED = 26                                     // скорость конвейера, % высоты в секунду — ОДНА на всю игру (экран пилюля проезжает за ≈ 5 с)

// Длительности, мс
export const DROP_MS = 1000        // слово падает и замирает
export const LANES_MS = 900        // дорожки проявляются
export const WORD_MS = 1000        // длина слова по умолчанию (слово без озвучки автора)
export const TURN_MS = 2200        // плашка «Теперь твоя очередь»
export const MIC_IN_MS = 600       // иконка микрофона выезжает снизу
export const END_TAIL_MS = 900     // после конца последнего слова диктора до плашки «твоя очередь» (пилюля ещё катится вниз)

/** Сколько миллисекунд пилюля едет от верхнего края (ENTER_Y) до центра зоны */
export const TRAVEL_MS = ((ZONE_Y - ENTER_Y) / SPEED) * 1000
/** Сколько миллисекунд пилюля едет от центра зоны до нижнего края (EXIT_Y) */
export const EXIT_TRAVEL_MS = ((EXIT_Y - ZONE_Y) / SPEED) * 1000

/**
 * Высота центра пилюли (y, %) в момент t мс, если середина её слова приходится на mid (мс): строго линейно — скорость SPEED всегда одна.
 * Не обрезается: ниже ENTER_Y пилюля ещё не выкатилась, выше EXIT_Y — уже ушла (рисует движок, он прячет такие кадры).
 */
export const pillYAt = (t, mid) => ZONE_Y + (SPEED * (t - mid)) / 1000

/** Момент (мс), когда пилюля со словом [at, at+ms] выкатывается из-за верхнего края */
export const spawnTime = (at, ms) => at + ms / 2 - TRAVEL_MS
/** Момент, когда она целиком ушла за нижний край */
export const exitTime = (at, ms) => at + ms / 2 + EXIT_TRAVEL_MS

/** Начало первого слова (мс от старта фазы), при котором первая пилюля выкатывается ровно в нулевую секунду и слово приходится на центр экрана */
export const leadFor = ms0 => Math.max(0, TRAVEL_MS - ms0 / 2)

// Расписание по умолчанию (слово без озвучки автора): первое слово — через leadFor(WORD_MS), дальше шаг PERIOD_MS (слово + пауза)
export const PERIOD_MS = WORD_MS + 800
export const WORD_AT = [0, 1, 2].map(k => leadFor(WORD_MS) + 100 + k * PERIOD_MS)
export const WORD_LEN = WORD_AT.map(() => WORD_MS)
/** Когда кончается фаза диктора: конец последнего слова + END_TAIL_MS */
export const listenEnd = (at, ms) => at.at(-1) + ms.at(-1) + END_TAIL_MS
export const LISTEN_MS = listenEnd(WORD_AT, WORD_LEN)

const clamp01 = v => Math.min(1, Math.max(0, v))
/** Мягкое торможение к концу (пилюля «садится» в зону) */
export const easeOutCubic = u => 1 - (1 - clamp01(u)) ** 3
/** Мягкий разгон (пилюля уходит вниз) */
export const easeInCubic = u => clamp01(u) ** 3
/** Плавно с обоих концов */
export const easeInOut = u => { const x = clamp01(u); return x * x * (3 - 2 * x) }

/**
 * Заливка пилюли (0…1) через t мс: пока звучит слово — по кривой речи (curve: доля слова → доля заливки; без неё линейно), до слова 0, после — 1.
 * Кривую строит makeFillCurve по реальной громкости слова диктора: ударный слог — заливка бежит, пауза внутри слова — стоит.
 */
export function pillFill(t, at, ms, curve = null) {
  const u = clamp01((t - at) / ms)
  return curve ? clamp01(curve(u)) : u
}

/**
 * Кривая заливки по громкости: wave — полоски громкости файла (любой масштаб), duration — длина файла, секунды; слово от start до end (с). Возвращает u (0…1 — доля слова) → доля заливки:
 * накопленная громкость, нормированная на всё слово. К громкости добавляется пол FLOOR, чтобы пауза внутри слова не останавливала заливку насовсем. Нет волны — null (линейно).
 */
export const FILL_FLOOR = 0.12
export function makeFillCurve(wave, duration, start, end) {
  if (!Array.isArray(wave) || wave.length < 2 || !(duration > 0) || !(end > start)) return null
  const peak = Math.max(...wave, 1e-9)
  const per = wave.length / duration
  const from = Math.max(0, Math.floor(start * per))
  const to = Math.min(wave.length, Math.max(from + 2, Math.ceil(end * per)))
  const cum = [0]
  for (let i = from; i < to; i++) cum.push(cum.at(-1) + wave[i] / peak + FILL_FLOOR)
  const total = cum.at(-1)
  const n = cum.length - 1
  return u => {
    const x = clamp01(u) * n
    const i = Math.min(n - 1, Math.floor(x))
    return (cum[i] + (cum[i + 1] - cum[i]) * (x - i)) / total
  }
}

// Фаза ученика: заливка идёт от живого голоса. Пока громкость выше порога, пилюля наполняется со скоростью, пропорциональной громкости, но не выше FILL_CAP — полной её делает
// только распознавание (слово принято). Тишина заливку не откатывает, но и не двигает; чужое слово — пилюля «отторгает»: сливается обратно (FILL_DRAIN, в секунду).
export const VOICE_THRESHOLD = 0.12
export const FILL_CAP = 0.85        // выше голос не наливает: полной пилюлю делает только распознавание («честная» оценка — громкость и слово это разное)
export const FILL_DRAIN = 3
export const LOCK_MS = 450          // принятое слово: заливка плавно доходит до 100 %

/**
 * Один кадр наливания голосом: p — текущая заливка, dt — секунды, level — громкость 0…1, ms — сколько звучало слово диктора. Скорость такова, что при уверенной громкости
 * (≥ 0,5) заливка доходит до FILL_CAP ровно за длину слова диктора: сказал в его темпе — пилюля наполнилась в такт; сказал короче — не дотянул; растянул — дотянул позже.
 */
export function voiceFillStep(p, dt, level, ms = WORD_MS) {
  if (!(level > VOICE_THRESHOLD)) return p
  const rate = FILL_CAP / (Math.max(300, ms) / 1000)
  return Math.min(FILL_CAP, Math.max(p, p + Math.max(0, dt) * rate * Math.min(1, level / 0.5)))
}

/**
 * «Тень» слова диктора для подсказки ученику: профиль громкости по высоте пилюли, снизу вверх, n значений 0…1 (1 — самый громкий кусок слова). Строится из кривой заливки
 * (makeFillCurve) как её производная; без кривой (слово без озвучки автора) — ровно. Ученик видит, где слово «громкое», где тихое и сколько оно длится (метка темпа — WordLanePills).
 */
export function fillProfile(curve, n = 10) {
  if (!curve) return Array.from({ length: n }, () => 0.6)
  const d = Array.from({ length: n }, (_, i) => Math.max(0, curve((i + 1) / n) - curve(i / n)))
  const peak = Math.max(...d, 1e-9)
  return d.map(v => 0.25 + 0.75 * (v / peak))
}

/** Слив при чужом слове */
export const drainStep = (p, dt) => Math.max(0, p - Math.max(0, dt) * FILL_DRAIN)

/** Распорядок игры: сколько длится каждая фаза без ожидания ученика, мс */
export const PHASE_MS = { drop: DROP_MS, lanes: LANES_MS, listen: LISTEN_MS, turn: TURN_MS }
