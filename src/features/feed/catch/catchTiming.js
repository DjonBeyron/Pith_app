// Тайминги финала «Ловли слов» (спек: сначала клавиатура уезжает, и только потом шарики раскрываются облачко за облачком).
// Согласованы с CSS (feed-catch-sheet.css: сворачивание шторки 260мс; feed-catch-strip.css: линия/факт/цвета).

export const CATCH_COLLAPSE_MS = 280      // шторка сворачивается 260мс (+ запас) — взрывы начинаются после
export const CATCH_EXPLODE_STEP_MS = 120  // шаг между облачками, слева направо
export const CATCH_COMPARE_GAP_MS = 380   // после взрыва последнего облачка — линия, набранное, факт
export const CATCH_RULE_MS = 220          // линия рисуется (scaleX 0→1); факт начинает проявляться после неё

// Через сколько мс после «Проверить» начинает взрываться i-е облачко (i с нуля)
export const explodeAt = i => CATCH_COLLAPSE_MS + i * CATCH_EXPLODE_STEP_MS

// Через сколько мс после «Проверить» проявляется сравнение (линия, цвета набранного, факт) при n словах
export const compareDelay = n => explodeAt(Math.max(0, n - 1)) + CATCH_COMPARE_GAP_MS

// Через сколько мс после «Проверить» факт «Расслышал N из M слов» начинает проявляться (fade): когда линия уже нарисована
export const factDelay = n => compareDelay(n) + CATCH_RULE_MS
