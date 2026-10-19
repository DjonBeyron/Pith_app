// Классы пузыря голосового сообщения (вынесено из AudioModule.jsx: файл у потолка строк)
export function audioBubbleClass(hasText, isFading) {
  return [
    'playerMsgBubble', 'playerMsgBubble--audio',
    // Без расшифровки — фиксированная ширина (25vw), а не fit-content по содержимому волны: без текста-«призрака»
    // единственное, что влияет на fit-content, — дорожка волны, а её плотность (barCount) пересчитывается ПОСЛЕ первого
    // кадра (ResizeObserver) — пузырь долю секунды рисовался шире, потом скакал к 25vw. Явная ширина убирает обратную связь
    !hasText ? 'playerMsgBubble--audioNoText' : '',
    isFading ? 'playerMsgBubbleFading' : '',
  ].filter(Boolean).join(' ')
}
