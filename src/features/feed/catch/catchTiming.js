// Тайминги финала «Ловли слов» (спек: сначала клавиатура уезжает, и только потом шарики раскрываются облачко за облачком).
// Согласованы с CSS (feed-catch-sheet.css: сворачивание шторки 260мс; feed-catch-strip.css: линия/факт/цвета) и с длиной
// растворения одного облачка EXPLODE_MS (phraseBubbleConsts.js): соседние облачка не накладываются во времени больше, чем
// на CATCH_EXPLODE_OVERLAP от его длины (0.6: пространственно облачка не мешают друг другу — разлёт в сторону ещё живого соседа ограничен 0.75 зазора, phraseBubbleFlight.js, — поэтому по времени можно наползать).
import { EXPLODE_MS } from '../phraseBubbleConsts.js'

export const CATCH_COLLAPSE_MS = 280      // шторка сворачивается 260мс (+ запас) — взрывы начинаются после
export const CATCH_EXPLODE_OVERLAP = 0.6  // насколько (доля EXPLODE_MS) растворение следующего облачка может налезать на предыдущее
export const CATCH_EXPLODE_STEP_MS = Math.ceil(EXPLODE_MS * (1 - CATCH_EXPLODE_OVERLAP)) // шаг между облачками, слева направо
export const CATCH_COMPARE_GAP_MS = 640   // линия, цвета набранного — когда последнее облачко уже на последней трети растворения
export const CATCH_RULE_MS = 220          // линия рисуется (scaleX 0→1); факт начинает проявляться после неё
export const CATCH_COLOR_MS = 320         // цвета набранного перетекают из лайма в цвет вердикта (feed-catch-strip.css: catchToColor)
export const CATCH_COMPRESS_HOLD_MS = 150 // сравнение «постоит» перед сжатием промежутков
export const CATCH_COMPRESS_MS = 450      // длительность сжатия word-spacing к центру (то же число в feed-catch-strip.css)

// Через сколько мс после «Проверить» начинает взрываться i-е облачко (i с нуля)
export const explodeAt = i => CATCH_COLLAPSE_MS + i * CATCH_EXPLODE_STEP_MS

// Через сколько мс после «Проверить» проявляется сравнение (линия, цвета набранного, факт) при n словах
export const compareDelay = n => explodeAt(Math.max(0, n - 1)) + CATCH_COMPARE_GAP_MS

// Через сколько мс после «Проверить» факт «Расслышал N из M слов» начинает проявляться (fade): когда линия уже нарисована
// И последнее облачко полностью растворилось (факт появляется после последнего облачка, не поверх него)
export const factDelay = n => Math.max(compareDelay(n) + CATCH_RULE_MS, explodeAt(Math.max(0, n - 1)) + EXPLODE_MS)

// Через сколько мс после «Проверить» обе строки (оригинал и набранное) начинают сжиматься к центру (word-spacing: широкие
// промежутки → обычный пробел, CATCH_COMPRESS_MS): когда последнее облачко растворилось, цвета сравнения перетекли и
// факт уже проявляется, плюс короткая пауза, чтобы сравнение успели увидеть в прежней раскладке
export const compressDelay = n => Math.max(factDelay(n), compareDelay(n) + CATCH_COLOR_MS) + CATCH_COMPRESS_HOLD_MS
