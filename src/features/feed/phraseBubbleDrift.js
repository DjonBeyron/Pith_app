// Дрейф групп шариков-спойлера: keyframes считаются по той же формуле, что
// раньше двигала каждый шарик на canvas (drawFloat: две наложенные синусоиды
// по x/y + «дыхание» радиуса), только теперь путь проходит целая группа, а не
// один шарик. Групп LAYER_COUNT, соседние шарики сетки попадают в разные
// группы (через одну), поэтому относительное движение читается как прежнее
// поштучное колыхание. 48 ключевых кадров с linear — непрерывная синусоида
// без «шаг-стоп» на разворотах, которым грешили редкие кадры с ease-in-out.
//
// Частоты — целые кратные одного периода (1×, 2×, 3×), чтобы петля
// замыкалась ровно за длительность анимации, без скачка на стыке.
// Стили инжектятся один раз в <head> (ensureDriftStyles) — в CSS-файле
// такое не запишешь без ручной выкладки полусотни строк на группу.
export const LAYER_COUNT = 6
const STEPS = 48
const STYLE_ID = 'phrase-bubble-drift'

// Период группы, с — как у прежних скоростей шариков (0.7–1.2 рад/с)
export function driftDuration(g) {
  return 5.5 + g * 0.8
}

function keyframes(g) {
  // Амплитуда 2.4–3.6px (у шариков было 1.3–4.5 поштучно) и своя фаза/
  // направление у каждой группы
  const amp = 2.4 + (g % 3) * 0.6
  const phi = g * 1.05
  const dir = g % 2 ? 1 : -1
  let css = `@keyframes bubbleDrift${g}{`
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const w = 2 * Math.PI * t
    const dx = Math.cos(w * dir + phi) * amp + Math.sin(3 * w + phi * 2) * amp * 0.35
    const dy = (Math.sin(2 * w + phi) * amp + Math.cos(3 * w + phi) * amp * 0.35) * 0.45
    const sc = 1 + 0.012 * Math.sin(2 * w + phi * 1.7)
    css += `${(t * 100).toFixed(2)}%{transform:translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) scale(${sc.toFixed(4)})}`
  }
  return css + '}'
}

export function ensureDriftStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  let css = ''
  for (let g = 0; g < LAYER_COUNT; g++) css += keyframes(g)
  style.textContent = css
  document.head.appendChild(style)
}
