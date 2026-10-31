// Раскладка и время вертикальной игры «Повтори за диктором» (RotatePhoneModule). Чистые функции — без React и DOM, проверяются тестами.
// Сцена меряется в ПРОЦЕНТАХ высоты экрана (y — от верха), x — от левого края. Три дорожки — три равные колонки с разделителями; в каждой своя вертикальная пустая пилюля.
// КОНВЕЙЕР: пилюли выкатываются сверху ПОСТОЯННО С ОДНОЙ СКОРОСТЬЮ (SPEED, %/с) и катятся вниз, не останавливаясь и не ускоряясь. Сверху экран затемнён (FADE_TOP) — пилюля выезжает
// из тьмы; как только она ПОЛНОСТЬЮ открылась (центр в OPEN_Y — верхний край вышел из затемнения), диктор начинает произносить её слово. Пока слово звучит, пилюля заливается снизу вверх
// синхронно с речью; в конце слова щёлкает и катится дальше — внизу экран снова затемнён (FADE_BOTTOM): пилюля уходит во тьму.
// Фаза ученика — тот же конвейер: пилюли едут сами; ученик должен успеть сказать слово, пока пилюля на экране (wordLaneStudent.js): принято — заливка, щелчок, XP; пилюля ушла вниз
// без слова — «не успел» (она гаснет, и её выкатят снова).

export const SLOT_COUNT = 3
export const LANE_X = [100 / 6, 50, 500 / 6]                // середины дорожек, % ширины
export const LANE_EDGES = [100 / 3, 200 / 3]                // разделители дорожек, % ширины
export const PILL_W = 22                                    // ширина пилюли, % ширины экрана
export const PILL_H = 20                                    // высота пилюли, % высоты экрана
export const WORD_Y = 6                                     // центр слова наверху, % высоты
export const FADE_TOP = 14                                  // затемнение сверху, % высоты: пилюли выезжают из него (word-lane.css .wlFade--top — то же число)
export const FADE_BOTTOM = 28                               // затемнение снизу: пилюли уходят в него (.wlFade--bottom)
export const OPEN_Y = FADE_TOP + 10                         // центр пилюли, когда она ПОЛНОСТЬЮ открылась (верхний край = FADE_TOP, высота PILL_H = 20): с этого момента звучит её слово
export const ENTER_Y = -14                                  // центр пилюли за верхним краем (целиком вне экрана: низ на −4 %)
export const EXIT_Y = 118                                   // и за нижним
export const SPEED = 26                                     // скорость конвейера, % высоты в секунду — ОДНА на всю игру (экран пилюля проезжает за ≈ 5 с)

// Длительности, мс
export const DROP_MS = 1000        // слово падает и замирает
export const LANES_MS = 900        // дорожки проявляются
export const WORD_MS = 1000        // длина слова по умолчанию (слово без озвучки автора)
export const MIC_IN_MS = 600       // иконка микрофона выезжает снизу
export const END_TAIL_MS = 900     // после конца последнего слова диктора до плашки «твоя очередь» (пилюля ещё катится вниз)

/** Сколько миллисекунд пилюля едет от верхнего края (ENTER_Y) до полного открытия (OPEN_Y) — столько от выкатки до начала её слова */
export const TRAVEL_MS = ((OPEN_Y - ENTER_Y) / SPEED) * 1000
/** Сколько миллисекунд пилюля едет от начала своего слова до нижнего края (EXIT_Y) */
export const EXIT_TRAVEL_MS = ((EXIT_Y - OPEN_Y) / SPEED) * 1000

/**
 * Высота центра пилюли (y, %) в момент t мс, если её слово началось в at (мс): строго линейно — скорость SPEED всегда одна, слово начинается, когда пилюля полностью открыта (OPEN_Y).
 * Не обрезается: ниже ENTER_Y пилюля ещё не выкатилась, выше EXIT_Y — уже ушла (рисует движок, он прячет такие кадры).
 */
export const pillYAt = (t, at) => OPEN_Y + (SPEED * (t - at)) / 1000

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

// Фаза ученика: пока слово ТЕКУЩЕГО куска не распознано, его пилюля показывает только живой голос — «дыхание». Заливка плавно следует за громкостью к цели FILL_CAP·(громкость): атака быстрая, но
// мягкая (BREATH_ATTACK_MS), спад ещё мягче (BREATH_RELEASE_MS) — без скачков за кадр, паузы внутри слова не рвут заливку. Выше FILL_CAP голос не наливает: полным кусок делает только распознавание
// (слово принято — кусок защёлкивается зелёным, LOCK_MS). Чужое слово — пилюля «отторгает»: сливается обратно (FILL_DRAIN, в секунду).
export const VOICE_THRESHOLD = 0.04      // порог голоса низкий: пилюля откликается на самый тихий звук
export const FILL_CAP = 0.85        // выше голос не наливает: полной пилюлю делает только распознавание («честная» оценка — громкость и слово это разное)
export const FILL_DRAIN = 3
export const LOCK_MS = 160          // принятое слово: заливка быстро доходит до 100 % (щелчок идёт сразу по принятию слова — раньше 450 мс «опаздывал»)
export const BREATH_ATTACK_MS = 90      // постоянная времени атаки заливки (за кадр в 16 мс — не больше ≈ 14 % шкалы)
export const BREATH_RELEASE_MS = 320    // и спада: заливка «выдыхается» втрое медленнее, чем наливается
export const BREATH_FULL_LEVEL = 0.3    // при такой громкости цель дыхания — FILL_CAP
export const BREATH_CURVE = 0.6         // показатель кривой «громкость → цель»: тихий голос сразу заметен, а не теряется внизу шкалы

/** Плавно вести заливку p к цели target (0…1) за dt секунд: вверх — с постоянной BREATH_ATTACK_MS, вниз — BREATH_RELEASE_MS; у самого нуля — в ноль */
export function fillTo(p, dt, target) {
  const tau = target > p ? BREATH_ATTACK_MS : BREATH_RELEASE_MS
  const next = p + (target - p) * (1 - Math.exp(-Math.max(0, dt) * 1000 / tau))
  return target <= 0 && next < 0.004 ? 0 : next
}

export const PRE_CONFIRM_CAP = 0.4      // пока распознаватель ещё ничего не услышал (partial на телефоне приходит через 0,2–0,5 с после слова), голос дышит не выше этого; 0 — только на подтверждённую речь

/** Один кадр «дыхания» куска голосом: p — текущая заливка, dt — секунды, level — громкость после ворот 0…1, cap — потолок (FILL_CAP; до подтверждения речи — PRE_CONFIRM_CAP). Тишина (level не выше порога) — цель 0, заливка мягко спадает */
export function breathStep(p, dt, level, cap = FILL_CAP) {
  const l = level > VOICE_THRESHOLD ? Math.min(1, level / BREATH_FULL_LEVEL) ** BREATH_CURVE : 0
  return fillTo(p, dt, Math.min(FILL_CAP, cap) * l)
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
