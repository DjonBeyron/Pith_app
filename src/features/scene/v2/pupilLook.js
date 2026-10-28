import { MASCOT_PACKS } from './sprites/mascot/mascots.js'

// Зрачки Пита под речь («живой Пит v2», флаг animV2) — БЕЗ React: пишем CSS-переменные --look-x / --look-y на корень маскота
// ([data-part="cat"], тот же элемент, что у рта), а сдвиг рисует CSS: translate у .pu с переходом 150 мс (scene-v2-cat.css).
// Бегущих анимаций нет — только короткий переход после каждого события; в покое и пока ничего не происходит, ничего не идёт.
//
// События (зовёт режиссёр, scenePlayLine.js / useSceneDirectorV2.js):
//   lineStart(who) — реплика началась: оба персонажа смотрят друг на друга (если второй есть; в одиночной сцене — прямо), у говорящего
//                    зрачки на PUPIL_MS расширяются (--pupil = PUPIL_DILATE);
//   word(who)      — граница слова у говорящего: с вероятностью ~1/3 маленькая саккада (±SACCADE_X / ±SACCADE_Y), иначе, если взгляд
//                    ещё «сбит» предыдущей саккадой, он возвращается на собеседника;
//   lineEnd()      — реплика кончилась (говорящего нет);
//   startIdle() / stopIdle() — в тишине (персонаж не говорит) раз в IDLE_MIN…IDLE_MAX мс лёгкий увод взгляда и возврат через IDLE_AWAY_MS.
// Размеры — в пикселях СПРАЙТА (коробка 200×240, посадка пакета fit.k): сдвиг в итоге ≤ MAX_LOOK = 5 px; в координатах пакета (где лежат
// зрачки) это делится на fit.k. Амплитуды подобраны по стенду ?scene=cmp: при 0,6 px спрайта сдвиг на экране был ≈ 0,3 px и не читался,
// зрачок Пита (≈ 6 px спрайта) может уходить на треть своего размера — это видно, но белок не покидает. Левый персонаж (who 'a') в сцене зеркалится (mascotSprite.js: flip = who === 'b'), поэтому «вправо на экране»
// для него — минус по x пакета. Таймеры и случайность инъектируются для тестов (look.test.js).

export const GAZE = 3
export const SACCADE_X = 2.2
export const SACCADE_Y = 1.2
export const MAX_LOOK = 5
export const SACCADE_CHANCE = 1 / 2
export const IDLE_MIN_MS = 3000
export const IDLE_MAX_MS = 5000
export const IDLE_AWAY_MS = 700
export const PUPIL_DILATE = 1.18 // расширение зрачка в начале реплики (кот «оживился»): --pupil на корне, CSS scale у .pu с переходом 350 мс
export const PUPIL_MS = 450      // и назад — редко, коротко и по событию: постоянная пульсация зрачков смотрелась бы неестественно
export const IDLE_AWAY_X = 3
export const IDLE_AWAY_Y = 1.5

const clamp = v => Math.max(-MAX_LOOK, Math.min(MAX_LOOK, v))

// getEl(who) → корень маскота | null; skinOf(who) → 'kit' | 'mia' | null (у обычного кота зрачки не трогаем)
export function createPupilLook({ whos = ['a', 'b'], getEl, skinOf = () => 'kit', timers = globalThis, rand = Math.random }) {
  const solo = whos.length < 2
  const off = {}                 // who → { x, y }: текущий сдвиг поверх взгляда на собеседника, px спрайта на экране
  let speaking = null
  let idleTimer = null
  let backTimer = null
  let pupilTimer = null

  // Расширение зрачков говорящего в начале реплики и возврат через PUPIL_MS
  function dilate(who) {
    const el = getEl(who)
    if (!el || !skinOf(who)) return
    timers.clearTimeout(pupilTimer)
    el.style.setProperty('--pupil', String(PUPIL_DILATE))
    pupilTimer = timers.setTimeout(() => { el.style.removeProperty('--pupil'); pupilTimer = null }, PUPIL_MS)
  }

  const baseOf = who => ({ x: solo ? 0 : who === 'a' ? GAZE : -GAZE, y: 0 }) // экранные «вправо / влево»: а смотрит вправо, b — влево

  // Экранные px спрайта → переменные в координатах пакета (зеркало и масштаб посадки)
  function write(who, sx, sy) {
    const el = getEl(who)
    const skin = skinOf(who)
    if (!el || !skin) return
    const k = MASCOT_PACKS[skin]?.fit?.k || 1
    const sign = who === 'b' ? 1 : -1
    el.style.setProperty('--look-x', (sign * clamp(sx) / k).toFixed(2))
    el.style.setProperty('--look-y', (clamp(sy) / k).toFixed(2))
  }
  function apply(who) {
    const b = baseOf(who)
    const o = off[who] ?? { x: 0, y: 0 }
    write(who, b.x + o.x, b.y + o.y)
  }
  const set = (who, x, y) => { off[who] = { x, y }; apply(who) }
  const centered = () => { for (const w of whos) set(w, 0, 0) }

  function nextIdle() {
    idleTimer = timers.setTimeout(() => {
      const quiet = whos.filter(w => w !== speaking)
      const who = quiet.length ? quiet[Math.floor(rand() * quiet.length)] : null
      if (who) {
        set(who, (rand() < 0.5 ? -1 : 1) * IDLE_AWAY_X, (rand() * 2 - 1) * IDLE_AWAY_Y)
        timers.clearTimeout(backTimer)
        backTimer = timers.setTimeout(() => { set(who, 0, 0) }, IDLE_AWAY_MS)
      }
      nextIdle()
    }, IDLE_MIN_MS + rand() * (IDLE_MAX_MS - IDLE_MIN_MS))
  }

  return {
    lineStart(who) { speaking = who; centered(); dilate(who) },
    word(who) {
      if (who !== speaking && speaking !== null) return
      const o = off[who] ?? { x: 0, y: 0 }
      if (rand() < SACCADE_CHANCE) set(who, (rand() * 2 - 1) * SACCADE_X, (rand() * 2 - 1) * SACCADE_Y)
      else if (o.x || o.y) set(who, 0, 0)
    },
    lineEnd() { speaking = null },
    startIdle() { if (idleTimer === null) nextIdle() },
    stopIdle() { timers.clearTimeout(idleTimer); timers.clearTimeout(backTimer); idleTimer = null; backTimer = null },
    // Конец жизни режиссёра: таймеры сняты, переменные убраны (зрачки встают в центр)
    stop() {
      this.stopIdle()
      timers.clearTimeout(pupilTimer); pupilTimer = null
      for (const w of whos) { const el = getEl(w); for (const k of ['--look-x', '--look-y', '--pupil']) el?.style?.removeProperty(k) }
    },
  }
}
