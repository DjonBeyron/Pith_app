// Порядок появления панели «Сказать фразу»: СНАЧАЛА в чате фраза (пузырь ведущего), и только через паузу поднимается панель.
// Без фразы в чате (showPhrase=false) ждать нечего — короткая пауза, только чтобы панель не выехала в тот же кадр, что и
// сообщение. Файл без импортов: его читает ленивая обёртка панели в основном коде плеера (код распознавания в основной чанк не тянем).
export const SAY_PANEL_DELAY_MS = 1500
export const SAY_PANEL_DELAY_NO_PHRASE_MS = 400
export const panelDelayMs = showPhrase => (showPhrase === false ? SAY_PANEL_DELAY_NO_PHRASE_MS : SAY_PANEL_DELAY_MS)
