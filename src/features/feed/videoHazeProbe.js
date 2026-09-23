// Слежка за «дымкой» на видео ленты (часть Android): после свайпа новое видео
// блёклое, «будто дымка», стартовое — яркое, первое касание экрана дымку
// убирает. Средство из 3.2.1711 (videoLayerNudge.js) сделано вслепую — здесь
// данные, чтобы найти причину точно.
//
// Сама дымка — на уровне композитора (Android Chrome выводит видео либо
// аппаратным оверлеем — цвета верные, либо смешивает через GPU — на части
// устройств блёкло), из JS её не увидеть. Поэтому снимаем всё, от чего
// зависит выбор оверлея, у каждого видео, когда слайд встал, и у стартового
// «яркого» для сравнения:
//   • выравнивание по ФИЗИЧЕСКИМ пикселям: у Android дробный DPR (2.625…), и
//     слайд N×812 может встать на полпикселя — такое видео в оверлей не
//     попадёт никогда;
//   • эффекты на предках видео: прозрачность, фильтры, 3D, скругления;
//   • цветовое пространство кадра (full/limited range — классика «блёклости»);
//   • подталкивания слоя и первое касание после остановки.
// Пользователь, увидев дымку, открывает DBG (касание дымку уберёт, но снимок
// уже снят ДО него) и жмёт «была дымка» — отмечается последнее видео.

const MAX = 30
const snaps = []
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

const frac = n => {
  const f = Math.abs(n - Math.round(n))
  return f < 0.01 ? '0' : f.toFixed(2)
}

// Что на пути от видео к ленте может помешать оверлею (только отличия от нормы)
function blockers(v, stop) {
  const out = []
  for (let el = v; el && el !== stop.parentElement; el = el.parentElement) {
    const s = getComputedStyle(el)
    const name = (el.className?.toString?.() || el.tagName).split(' ')[0].slice(0, 18)
    const t = []
    if (+s.opacity < 1) t.push(`opacity ${(+s.opacity).toFixed(2)}`)
    if (s.filter !== 'none') t.push('filter')
    if (s.transform !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(s.transform)) t.push(s.transform.startsWith('matrix3d') ? '3d' : 'transform')
    if (s.willChange !== 'auto') t.push(`will-change:${s.willChange}`)
    if (s.backfaceVisibility === 'hidden') t.push('backface-hidden')
    if (s.mixBlendMode !== 'normal') t.push(`blend:${s.mixBlendMode}`)
    if (s.clipPath !== 'none' || (s.maskImage && s.maskImage !== 'none')) t.push('clip/mask')
    if (s.overflow !== 'visible' && s.borderRadius !== '0px') t.push('скругление')
    if (t.length) out.push(`${name}(${t.join(',')})`)
  }
  return out.join(' ') || 'нет'
}

// Цветовое пространство кадра — через WebCodecs, если браузер умеет и если
// видео не с чужого домена без CORS (тогда браузер кадр не отдаёт)
function colorSpace(v) {
  if (typeof VideoFrame !== 'function') return 'нет WebCodecs'
  try {
    const f = new VideoFrame(v)
    const c = f.colorSpace || {}
    f.close()
    return `${c.primaries ?? '?'}/${c.transfer ?? '?'}/${c.matrix ?? '?'} ${c.fullRange === true ? 'full' : c.fullRange === false ? 'limited' : '?'}`
  } catch (e) {
    return e && e.name === 'SecurityError' ? 'недоступно (чужой домен без CORS)' : `ошибка ${e?.name || e}`
  }
}

// Снимок активного видео ленты. label — «старт» (яркое) или «после свайпа»
export function hazeSnapshot(root, label, nudges) {
  const v = root?.querySelector('.feedSlideWrapActive video')
  const slide = root?.querySelector('.feedSlideWrapActive')
  if (!v) return
  const dpr = window.devicePixelRatio || 1
  const r = v.getBoundingClientRect()
  const sw = root.swiper
  snaps.push({
    t: performance.now(),
    label,
    slide: slide?.dataset.swiperSlideIndex ?? '?',
    url: (v.dataset.url || '—').slice(-8),
    align: `top ${frac(r.top * dpr)} left ${frac(r.left * dpr)} ширина ${frac(r.width * dpr)} высота ${frac(r.height * dpr)}`,
    wrapper: sw ? frac(-sw.translate * dpr) : '?',
    video: `${v.videoWidth}x${v.videoHeight} rs=${v.readyState} ${v.paused ? 'пауза' : 'играет'} op=${v.style.opacity || '1'}`,
    blockers: blockers(v, root),
    color: colorSpace(v),
    nudges,
    touchAfter: null,
    hazy: false,
  })
  if (snaps.length > MAX) snaps.shift()
}

// Первое касание экрана после снимка: если пользователь «смахивает» дымку
// касанием — в отчёте будет видно, через сколько после остановки
export function hazeTouch() {
  const last = snaps[snaps.length - 1]
  if (last && last.touchAfter == null) last.touchAfter = performance.now() - last.t
}

// «На последнем видео была дымка» — отмечает последний снимок после свайпа
export function hazeMarkLast() {
  for (let i = snaps.length - 1; i >= 0; i--) {
    if (snaps[i].label !== 'старт') { snaps[i].hazy = true; return snaps[i].slide }
  }
  return null
}

export function hazeReport() {
  if (!snaps.length) return '(ещё нет снимков — полистай ленту)'
  const dpr = window.devicePixelRatio || 1
  const line = s => `${s.hazy ? '⚠ ДЫМКА ' : ''}[${(s.t / 1000).toFixed(1)}] ${s.label} слайд ${s.slide} ${s.url}: ` +
    `пиксели(дробь при dpr ${dpr}) ${s.align}, лента ${s.wrapper} | ${s.video} | эффекты: ${s.blockers} | ` +
    `цвет: ${s.color} | подталкиваний ${s.nudges ?? '—'} | касание через ${s.touchAfter == null ? '—' : (s.touchAfter / 1000).toFixed(1) + 'с'}`
  return [
    `Android: ${isAndroid ? 'да' : 'нет'}, dpr ${dpr}. Сравни «старт» (яркое видео) с отмеченными ⚠ ДЫМКА:`,
    'дробь в пикселях ≠ 0 у дымки и 0 у старта → видео встаёт на полпикселя (оверлей невозможен);',
    'разные «эффекты» → мешает стиль; limited/full в цвете → неверный диапазон.',
    ...snaps.map(line),
  ].join('\n')
}
