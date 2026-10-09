// Тайминги финала «Ловли слов» (спек: сначала клавиатура уезжает, и только потом шарики раскрываются облачко за облачком).
// Согласованы с CSS (feed-catch-sheet.css: сворачивание шторки 260мс; feed-catch-strip.css: линия/цвета; feed-catch-fact.css: факт) и с длиной
// растворения одного облачка EXPLODE_MS (phraseBubbleConsts.js): соседние облачка не накладываются во времени больше, чем
// на CATCH_EXPLODE_OVERLAP от его длины (0.6: частицы взорвавшегося облачка летят ПОВЕРХ ещё живого соседа — разлёт не ограничен, порядок слоёв задаёт drawExplode: левые облачка выше правых, — поэтому по времени можно наползать).
import { EXPLODE_MS } from '../phraseBubbleConsts.js'

export const CATCH_COLLAPSE_MS = 280      // шторка сворачивается 260мс (+ запас) — взрывы начинаются после
export const CATCH_EXPLODE_OVERLAP = 0.6  // насколько (доля EXPLODE_MS) растворение следующего облачка может налезать на предыдущее
export const CATCH_EXPLODE_STEP_MS = Math.ceil(EXPLODE_MS * (1 - CATCH_EXPLODE_OVERLAP)) // шаг между облачками, слева направо
export const CATCH_COMPARE_GAP_MS = 640   // линия, цвета набранного — когда последнее облачко уже на последней трети растворения
export const CATCH_RULE_MS = 220          // линия рисуется (scaleX 0→1); факт начинает проявляться после неё
export const CATCH_COLOR_MS = 320         // цвета набранного перетекают из лайма в цвет вердикта (feed-catch-strip.css: catchToColor)
export const CATCH_COMPRESS_HOLD_MS = 150 // сравнение «постоит» перед сжатием промежутков
export const CATCH_COMPRESS_MS = 450      // длительность сжатия word-spacing к центру (то же число в feed-catch-strip.css)
// Факт «Тебе удалось расслышать N из M слов»: тусклый «призрак» строки проявляется FACT_FADE_MS, а сама строка «зажигается»
// блеском — шторка со светлой полосой на фронте один раз проходит слева направо за FACT_REVEAL_MS (keyframes catchFactCurtain /
// catchFactLit / то же число в feed-catch-fact.css). Блеск стартует с паузой FACT_PAUSE_MS после проявления сравнения
export const CATCH_FACT_FADE_MS = 220
export const CATCH_FACT_REVEAL_MS = 800
export const CATCH_FACT_PAUSE_MS = 400    // пауза сверх раскладки: сравнение оригинал/набранное успевают увидеть до блеска
export const CATCH_GLINT_GAP_MS = 200     // пауза между концом сжатия фраз к центру и блеском строки факта (поверх неё ещё CATCH_FACT_PAUSE_MS)

// Через сколько мс после «Проверить» начинает взрываться i-е облачко (i с нуля)
export const explodeAt = i => CATCH_COLLAPSE_MS + i * CATCH_EXPLODE_STEP_MS

// Через сколько мс после «Проверить» проявляется сравнение (линия, цвета набранного, факт) при n словах
export const compareDelay = n => explodeAt(Math.max(0, n - 1)) + CATCH_COMPARE_GAP_MS

// Через сколько мс после «Проверить» факт «Тебе удалось расслышать N из M слов» начинает проявляться тусклым призраком: когда линия уже нарисована
// И последнее облачко полностью растворилось (факт появляется после последнего облачка, не поверх него)
export const factDelay = n => Math.max(compareDelay(n) + CATCH_RULE_MS, explodeAt(Math.max(0, n - 1)) + EXPLODE_MS)

// Через сколько мс после «Проверить» обе строки (оригинал и набранное) начинают сжиматься к центру (word-spacing: широкие
// промежутки → обычный пробел, CATCH_COMPRESS_MS): когда последнее облачко растворилось, цвета сравнения перетекли и
// факт уже проявляется, плюс короткая пауза, чтобы сравнение успели увидеть в прежней раскладке
export const compressDelay = n => Math.max(factDelay(n), compareDelay(n) + CATCH_COLOR_MS) + CATCH_COMPRESS_HOLD_MS

// Через сколько мс после «Проверить» строку факта «Тебе удалось расслышать N из M слов» зажигает блеск (сама строка до этого —
// тусклый призрак, factDelay): когда в финале всё отработало — облачка растворились, цвета перетекли и обе фразы сжались к
// центру (compressDelay + CATCH_COMPRESS_MS), плюс короткая пауза и ещё заметная пауза CATCH_FACT_PAUSE_MS. Блеск один, он закрывает финал
export const glintDelay = n => compressDelay(n) + CATCH_COMPRESS_MS + CATCH_GLINT_GAP_MS + CATCH_FACT_PAUSE_MS
