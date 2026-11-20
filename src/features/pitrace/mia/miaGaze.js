// Взгляд Пита в коробке (владелец v3.3.298): глаза в прорези следят за падающей пилюлей — влево / по центру / вправо по её дорожке, — но не всё падение, а только его середину: начинают
// примерно с 30 % пути пилюли по ленте и перестают за 30 % до конца (на 70 %); потом плавно отводят глаза и ждут следующую. Пока Пит говорит, он смотрит «прямо» — из-за перспективы коробки
// это чуть влево. Чистые функции без DOM: RaceMia.jsx раз в несколько кадров читает положение пилюль и передаёт сюда, глаза рисует boxArt.update({ look }).
export const GAZE = { FROM: 0.3, TO: 0.7, MAX: 4.2, SPEAK: -2.4, IN_TAU: 0.16, OUT_TAU: 0.5 }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

/** Пилюля, за которой следим: из pills [{ p, dx }] (p — доля пути по ленте 0…1, dx — смещение центра от глаз Пита в долях полуширины ленты) берём ту, что в окне FROM…TO и ушла дальше всех (самая старая). Нет — null */
export function pickPill(pills) {
  let best = null
  for (const q of pills) if (q.p >= GAZE.FROM && q.p <= GAZE.TO && (!best || q.p > best.p)) best = q
  return best
}

/** Взгляд (единицы грани коробки, плюс — вправо) на пилюлю со смещением dx */
export const lookOf = dx => clamp(dx, -1, 1) * GAZE.MAX

/** Шаг сглаживания взгляда: g = { look, w } (w — вес «смотрит на дорожку / говорит», 0 — глаза живут сами по eyeLife); pill — выбранная пилюля или null, talking — Пит говорит, dt — секунды. → новое g */
export function stepGaze(g, { pill, talking, dt }) {
  const on = talking || !!pill, target = talking ? GAZE.SPEAK : pill ? lookOf(pill.dx) : 0
  const tau = on ? GAZE.IN_TAU : GAZE.OUT_TAU, k = 1 - Math.exp(-Math.max(0, dt) / tau)
  return { look: g.look + (target - g.look) * k, w: g.w + ((on ? 1 : 0) - g.w) * k }
}

/** Пилюли ленты на экране → [{ p, dx }] для pickPill: p — доля пути центра пилюли по ленте (.wlLanes), dx — смещение центра от середины экрана в ширинах дорожки (три дорожки: −1, 0, 1). Принятые (data-lock) и не успевшие (data-fail) не в счёт */
export function readPills(stage) {
  const lanes = stage.querySelector('.wlLanes'); if (!lanes) return []
  const L = lanes.getBoundingClientRect(), S = stage.getBoundingClientRect(); if (!(L.height > 0 && S.width > 0)) return []
  const out = []
  for (const el of stage.querySelectorAll('.wlPill')) { // пилюли лежат в .wlField рядом с лентой, не внутри неё
    if (el.hasAttribute('data-lock') || el.hasAttribute('data-fail')) continue
    const r = el.getBoundingClientRect(); if (!(r.height > 0)) continue
    out.push({ p: (r.top + r.height / 2 - L.top) / L.height, dx: (r.left + r.width / 2 - (S.left + S.width / 2)) / (S.width / 3) })
  }
  return out
}
