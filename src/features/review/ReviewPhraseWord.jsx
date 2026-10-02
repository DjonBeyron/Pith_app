import { useLayoutEffect, useRef, useState } from 'react'

// Слово сессии во фразе шапки карточки: пока ответа нет — точки ●●●, после ответа — само слово. Не «щёлкает», а плавно
// раскрывается: слот слова меняет ширину от ширины точек к ширине слова (расширяется или сужается), и левая и
// правая части фразы — она стоит по центру — мягко раздвигаются или сходятся; точки гаснут, слово проявляется.
// Ширина ведётся инлайном только на время перехода (лишнее обрезано clip-path, он не трогает строку), потом
// снова авто: полностью раскрытая фраза рассчитана браузером как обычный текст и всегда отображается корректно
// (в том числе при смене размера окна). Слово в разметке появляется только после ответа (до него в DOM — одни точки).
// Классы слота вешаются руками (React их не трогает: className постоянный): rvSlot--opening — идёт переход,
// rvSlot--open — раскрыто. Стили — review-phrase.css; без анимации (reduced motion) слово открывается сразу
const FADE_MS = 520 // сколько ждать, если ширина не меняется (слово той же ширины, что точки)
const OPEN_MS = 560 // переход ширины (review-phrase.css)

export default function ReviewPhraseWord({ text, revealed }) {
  const [openAtMount] = useState(revealed)
  const slotRef = useRef(null)
  const wordRef = useRef(null)

  useLayoutEffect(() => {
    const slot = slotRef.current
    const word = wordRef.current
    if (!revealed || !slot || !word || slot.classList.contains('rvSlot--open')) return undefined
    const from = slot.getBoundingClientRect().width // ширина точек (слово пока вне потока, невидимо)
    const to = word.getBoundingClientRect().width
    const finish = () => { slot.classList.remove('rvSlot--opening'); slot.classList.add('rvSlot--open'); slot.style.width = '' }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { finish(); return undefined }
    const grows = Math.abs(from - to) >= 1
    if (grows) slot.style.width = `${from}px` // слово встанет в поток, а ширина слота пока прежняя — ничего не прыгнет
    slot.classList.add('rvSlot--opening')
    slot.getBoundingClientRect() // зафиксировать стартовое состояние до перехода
    if (grows) slot.style.width = `${to}px`
    const timer = setTimeout(finish, (grows ? OPEN_MS : FADE_MS) + 80) // страховка, если transitionend не придёт
    const onEnd = e => { if (e.target === slot && e.propertyName === 'width') { clearTimeout(timer); finish() } }
    slot.addEventListener('transitionend', onEnd)
    return () => { clearTimeout(timer); slot.removeEventListener('transitionend', onEnd) }
  }, [revealed])

  return (
    <span ref={slotRef} className={openAtMount ? 'rvSlot rvSlot--open' : 'rvSlot'}>
      <span className="reviewPhraseHidden rvDots" aria-hidden={revealed}>{'●'.repeat(text.length)}</span>
      {revealed && <span ref={wordRef} className="reviewPhraseWord rvWord">{text}</span>}
    </span>
  )
}
