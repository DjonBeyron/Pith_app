// Масштаб фразы полоски «Ловли слов»: фраза всегда в одну строку. Промежутки между словами нарочно большие
// (word-spacing в feed-catch-strip.css), поэтому длинная фраза может не влезть — тогда уменьшаем её ЦЕЛИКОМ
// (font-size, а word-spacing в em уменьшается вместе с ним), а не переносим. Чистая арифметика без DOM (catchFit.test.js);
// ширины читает CatchStripPhrase (естественная ширина строки при white-space: nowrap и доступная ширина обёртки).

export const CATCH_FONT_PX = 17      // размер шрифта фразы при масштабе 1 (как .feedPhrase в ленте)
export const CATCH_MIN_SCALE = 11 / 17 // меньше фразу не жмём (~11px); не влезла и так — перенос как запасной вариант
const SLACK_PX = 2                    // запас по ширине: облачка и дробные ширины
const SCALE_STEPS = 100               // масштаб округляется вниз до сотых — не дребезжит от субпикселей
const GROW_MIN = 0.02                 // увеличение меньше этого не применяем (гистерезис против «туда-сюда»)

export const FIT_NONE = { scale: 1, wrap: false }

// Размер шрифта фразы в px для масштаба
export const fontPx = scale => Math.round(CATCH_FONT_PX * scale * 100) / 100

// Нужный масштаб: natural — ширина строки при масштабе 1, avail — доступная ширина. { scale, wrap }: влезает → 1;
// иначе avail / natural, но не меньше CATCH_MIN_SCALE; и при минимуме не влезает → wrap: true (разрешён перенос)
export function fitFor(natural, avail) {
  if (!(natural > 0) || !(avail > 0)) return FIT_NONE
  const raw = (avail - SLACK_PX) / natural
  if (raw >= 1) return FIT_NONE
  if (raw >= CATCH_MIN_SCALE) return { scale: Math.floor(raw * SCALE_STEPS) / SCALE_STEPS, wrap: false }
  return { scale: CATCH_MIN_SCALE, wrap: true }
}

// Следующее значение с гистерезисом: cur — текущее, natural/avail — свежий замер. Возвращает cur (тот же объект), если
// менять нечего: незначительное увеличение (< GROW_MIN, кроме возврата к 1) не применяется
export function nextFit(cur, natural, avail) {
  const want = fitFor(natural, avail)
  if (want.wrap === cur.wrap && want.scale === cur.scale) return cur
  if (want.wrap === cur.wrap && want.scale > cur.scale && want.scale < 1 && want.scale - cur.scale < GROW_MIN) return cur
  return want
}
