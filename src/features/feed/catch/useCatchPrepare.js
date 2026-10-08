import { useEffect, useRef } from 'react'

// «Готово» в «Ловле слов»: под уходящим накрытием фраза уже готова. Этот хук — подготовка заранее: на финале
// (шторка открыта, фаза result, «Готово» ещё не нажато) через CATCH_PREPARE_DELAY_MS — когда шторка уже свернулась
// (CATCH_COLLAPSE_MS), а тяжёлые анимации взрыва идут, но монтирование нескольких span'ов дёшево — зовёт onPrepare
// (FeedSlide: setRevealed(true) → слова фразы и подложка монтируются внутри ещё скрытого блока .feedPhraseBlockHidden).
// setState — только внутри таймера. Побочные эффекты открытия (onPhraseOpened, onLearnChanged, onLock(false)) остаются
// ПОСЛЕ ухода накрытия (FeedSlide / useSlideCatch). Если «Готово» нажали раньше — подготовки нет (таймер снимается),
// фраза проявляется как раньше, после ухода накрытия.
// Заодно в том же таймере меряем, закрывает ли накрытие блок фразы целиком (coversPhrase), и пишем результат прямо в
// data-catch-under слайда (без setState): "1" — закрывает, и фраза снимается со скрытия мгновенно; "0" — не закрывает на этом
// экране, и CSS (feed-catch.css, feed-phrase-plate.css) проявляет её быстрым fade 120мс.
export const CATCH_PREPARE_DELAY_MS = 320
const COVER_TOP_GAP = 24  // верх накрытия скруглён (18px) и подложка выступает над фразой на 5px: от верха нужен запас
const COVER_SIDE_GAP = 12 // подложка шире фразы на 10px с каждой стороны

// Накрывает ли прямоугольник cover прямоугольник stack целиком (с запасом под скругление и подложку). Прямоугольники —
// { top, bottom, left, right } как у getBoundingClientRect
export function coversPhrase(cover, stack) {
  if (!cover || !stack) return false
  return stack.top - COVER_TOP_GAP >= cover.top && stack.bottom <= cover.bottom
    && stack.left - COVER_SIDE_GAP >= cover.left && stack.right + COVER_SIDE_GAP <= cover.right
}

function measureUnder(root) {
  const cover = root.querySelector('.catchCover')
  const stack = root.querySelector('.feedPhraseStack')
  return cover && stack ? coversPhrase(cover.getBoundingClientRect(), stack.getBoundingClientRect()) : false
}

// ct — результат useSlideCatch (open, phase, done); opened — фраза уже открыта; rootRef — корень слайда
export function useCatchPrepare({ ct, opened, rootRef, onPrepare }) {
  const prepareRef = useRef(onPrepare)
  useEffect(() => { prepareRef.current = onPrepare })
  const armed = ct.open && ct.phase === 'result' && !ct.done && !opened
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => {
      const root = rootRef.current
      if (root) root.dataset.catchUnder = measureUnder(root) ? '1' : '0'
      prepareRef.current()
    }, CATCH_PREPARE_DELAY_MS)
    return () => clearTimeout(t)
  }, [armed, rootRef])
}
