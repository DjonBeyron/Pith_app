// Раскладка и время вертикальной игры «Повтори за диктором» (RotatePhoneModule). Чистые функции — без React и DOM, проверяются тестами.
// Сцена меряется в ПРОЦЕНТАХ высоты экрана (y — от верха), x — от левого края. Три дорожки — три равные колонки с разделителями; в каждой своя вертикальная пустая пилюля.
// Пилюли идут ПО ОЧЕРЕДИ: пилюля k выплывает сверху, плавно опускается в «зону голоса» — примерно центр экрана — и к началу слова диктора стоит там; пока слово звучит, она
// заливается снизу вверх синхронно с речью (в конце слова залита целиком и «щёлкает», wordLaneSnap.js), потом плавно уходит вниз за экран, а следующая уже опускается.
// В фазе ученика то же самое, но пилюля ждёт в зоне голоса, заливается живым голосом ученика (voiceFillStep), а вердикт «слово принято» даёт распознавание.

export const SLOT_COUNT = 3
export const LANE_X = [100 / 6, 50, 500 / 6]                // середины дорожек, % ширины
export const LANE_EDGES = [100 / 3, 200 / 3]                // разделители дорожек, % ширины
export const PILL_W = 22                                    // ширина пилюли, % ширины экрана
export const PILL_H = 20                                    // высота пилюли, % высоты экрана
export const WORD_Y = 6                                     // центр слова наверху, % высоты
export const ZONE_Y = 48                                    // центр «зоны голоса» — примерно центр экрана
export const ENTER_Y = -14                                  // центр пилюли за верхним краем (она целиком вне экрана: низ на -4 %)
export const EXIT_Y = 118                                   // и за нижним
export const HOLD_DRIFT = 1.5                               // пока слово звучит, пилюля чуть сползает вниз — стоячая картинка выглядела бы мёртвой

// Длительности, мс
export const DROP_MS = 1000        // слово падает и замирает
export const LANES_MS = 900        // дорожки проявляются
export const DESCENT_MS = 1100     // пилюля опускается сверху в зону голоса
export const EXIT_MS = 1000        // после щелчка уходит вниз
export const GAP_MS = 500          // минимум между концом слова и началом следующего: за это время предыдущая уже уходит, следующая опускается
export const WORD_MS = 1000        // длина слова по умолчанию (слово без озвучки автора)
export const TURN_MS = 2200        // плашка «Теперь твоя очередь»
export const MIC_IN_MS = 600       // иконка микрофона выезжает снизу
export const EXIT_TAIL_MS = 400    // после ухода последней пилюли ещё столько до следующей фазы

// Расписание по умолчанию: слово k начинается через DESCENT_MS + k·PERIOD_MS (опускание первой пилюли + шаг «слово + пауза»)
export const PERIOD_MS = WORD_MS + 700
export const WORD_AT = [DESCENT_MS + 200, DESCENT_MS + 200 + PERIOD_MS, DESCENT_MS + 200 + PERIOD_MS * 2]
export const WORD_LEN = WORD_AT.map(() => WORD_MS)
export const LISTEN_MS = WORD_AT[2] + WORD_LEN[2] + EXIT_MS + EXIT_TAIL_MS

const clamp01 = v => Math.min(1, Math.max(0, v))
/** Мягкое торможение к концу (пилюля «садится» в зону) */
export const easeOutCubic = u => 1 - (1 - clamp01(u)) ** 3
/** Мягкий разгон (пилюля уходит вниз) */
export const easeInCubic = u => clamp01(u) ** 3
/** Плавно с обоих концов */
export const easeInOut = u => { const x = clamp01(u); return x * x * (3 - 2 * x) }

/**
 * Высота центра пилюли (y, %) через t мс после старта фазы диктора, если её слово начинается в at и звучит ms:
 * до at − DESCENT_MS — за верхним краем; потом плавно опускается в зону голоса; пока слово звучит — стоит с лёгким сползанием; после слова — уходит вниз.
 */
export function pillY(t, at, ms) {
  const arrive = at
  const leave = at + ms
  if (t <= arrive - DESCENT_MS) return ENTER_Y
  if (t < arrive) return ENTER_Y + (ZONE_Y - ENTER_Y) * easeOutCubic((t - (arrive - DESCENT_MS)) / DESCENT_MS)
  if (t < leave) return ZONE_Y + HOLD_DRIFT * ((t - arrive) / ms)
  if (t < leave + EXIT_MS) return ZONE_Y + HOLD_DRIFT + (EXIT_Y - ZONE_Y - HOLD_DRIFT) * easeInCubic((t - leave) / EXIT_MS)
  return EXIT_Y
}

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
