// Как угол попадает в ус (<path class="wh">): три способа записи, переключаются на устройстве (HUD ⚙ игры «Повтори за диктором» → «Усы»). Чистый модуль без React и без обязательного DOM — элементы приходят аргументами.
// Зачем три. На iPhone (Safari, iOS 18) владелец трижды видел «топорный» старт и конец качания усов, хотя в Chromium трассы гладкие. Проверить Safari здесь нельзя, поэтому способ записи выбирается ему на месте, а не гадается:
//  • rotate    — style.rotate = 'N deg' (отдельное CSS-свойство «rotate»; якорь — transform-box: fill-box + transform-origin из scene-v2-pit.css). Так было с v3.3.65.
//  • transform — style.transform = 'rotate(Ndeg)' (то же, что rotate, но через обычное свойство transform; якорь тот же).
//  • attr      — SVG-атрибут transform="rotate(N cx cy)" с ЯВНЫМ центром. Самый совместимый путь для WebKit: это старейший механизм SVG, он не зависит ни от transform-box, ни от transform-origin в процентах, ни от
//                индивидуальных transform-свойств на SVG-элементах (у WebKit с ними были ошибки раскладки). Центр считается один раз из getBBox() (край fill-box у морды — тот же, что в CSS) и кладётся в кэш по контуру (d).
//                Чтобы CSS-якорь (transform-box / transform-origin) не сдвинул явный центр, на время записи ус получает inline transform-origin: 0 0 и transform-box: view-box (обычные значения SVG); при снятии они убираются.
// Режим по умолчанию — attr: по документации и истории WebKit это единственный способ, чьё поведение не зависит от новых CSS-возможностей; остальные два оставлены для сравнения на самом устройстве.
export const WHISKER_MODE_KEY = 'pithy_whisker_mode_v1'
export const WHISKER_MODES = Object.freeze(['rotate', 'transform', 'attr'])
export const DEFAULT_WHISKER_MODE = 'attr'

const valid = m => WHISKER_MODES.includes(m)
const store = () => { try { return globalThis.localStorage } catch { return null } }

/** Режим из хранилища; нет ключа, мусор, закрытое хранилище — режим по умолчанию */
export function readWhiskerMode(s = store()) {
  try { const v = s?.getItem(WHISKER_MODE_KEY); return valid(v) ? v : DEFAULT_WHISKER_MODE } catch { return DEFAULT_WHISKER_MODE }
}
/** Записать режим (чужое значение игнорируется); по умолчанию ключ снимается, чтобы хранилище не засорялось */
export function writeWhiskerMode(mode, s = store()) {
  if (!valid(mode)) return
  try { if (mode === DEFAULT_WHISKER_MODE) s?.removeItem(WHISKER_MODE_KEY); else s?.setItem(WHISKER_MODE_KEY, mode) } catch { /* приватный режим — живёт до перезагрузки (current ниже) */ }
}

// Текущий режим живёт в памяти: привод спрашивает его каждый кадр, а читать localStorage на каждом кадре незачем. HUD меняет его через setWhiskerMode — привод подхватит на ближайшем кадре
let current = null
export const getWhiskerMode = () => current ?? (current = readWhiskerMode())
export function setWhiskerMode(mode, s = store()) { if (!valid(mode)) return; current = mode; writeWhiskerMode(mode, s) }
/** Строка для журнала отладки: «режим attr (по умолчанию)» / «режим rotate (выбран в HUD)» */
export const whiskerModeLine = () => { const m = getWhiskerMode(); return `режим ${m} (${m === DEFAULT_WHISKER_MODE ? 'по умолчанию' : 'выбран в HUD'})` }
/** Для тестов: забыть режим из памяти */
export const forgetWhiskerMode = () => { current = null }

// Якорь вращения для attr: край fill-box у морды (у левых усов правый край, у правых — левый), середина по высоте. Кэш по side|d: головы base / love / shy собраны из одних контуров, скрытые (display: none)
// не измеряются getBBox — берут якорь у видимой головы
const RETRY_EVERY = 20 // кадров между попытками измерить скрытый ус
const anchors = new Map()
const anchorOf = w => {
  if (w.anchor) return w.anchor
  if (w.skip > 0) { w.skip -= 1; return null } // скрытая голова: не дёргаем getBBox (он заставляет браузер досчитывать стили) на каждом кадре
  const d = w.el.getAttribute?.('d') ?? ''
  const key = `${w.kind.side}|${d}`
  let a = d ? anchors.get(key) : undefined
  if (!a) {
    try {
      const b = w.el.getBBox()
      if (b && b.width > 0 && b.height > 0) { a = { cx: +(b.x + (w.kind.side === 'l' ? b.width : 0)).toFixed(2), cy: +(b.y + b.height / 2).toFixed(2) }; if (d) anchors.set(key, a) }
    } catch { /* скрыт или ещё не нарисован — попробуем позже */ }
  }
  if (!a) w.skip = RETRY_EVERY
  if (a) w.anchor = a
  return a ?? null
}
/** Для тестов: забыть кэш якорей */
export const forgetAnchors = () => anchors.clear()

const deg = v => `${v.toFixed(2)}deg`

const WRITERS = {
  rotate: { apply: (w, v) => { w.el.style.rotate = deg(v); return true }, clear: w => { w.el.style.rotate = '' } },
  transform: { apply: (w, v) => { w.el.style.transform = `rotate(${deg(v)})`; return true }, clear: w => { w.el.style.transform = '' } },
  attr: {
    apply(w, v) {
      const a = anchorOf(w)
      if (!a) return false // якоря пока нет — не пишем (скрытая голова); привод попробует снова
      if (!w.armed) { w.el.style.transformOrigin = '0 0'; w.el.style.transformBox = 'view-box'; w.armed = true }
      w.el.setAttribute('transform', `rotate(${v.toFixed(2)} ${a.cx} ${a.cy})`)
      return true
    },
    clear(w) {
      w.el.removeAttribute('transform')
      if (w.armed) { w.el.style.transformOrigin = ''; w.el.style.transformBox = ''; w.armed = false }
    },
  },
}

/** { apply(w, градусы) → записано ли, clear(w) } для режима; w = { el, kind: {side, low}, ... }. Неизвестный режим — как по умолчанию */
export const whiskerWriter = mode => WRITERS[valid(mode) ? mode : DEFAULT_WHISKER_MODE]
