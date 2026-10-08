import { useLayoutEffect } from 'react'

// Геометрия подложки под фразой (.feedPhrasePlate, feed-phrase-plate.css). Подложка — один absolute-элемент в стопке
// фразы; размеры берём у самой вёрстки и кладём в CSS-переменные стопки (без setState — слайд не перерисовывается):
//   --pp-y  — смещение сверху; --pp-w / --pp-h — «чуть шире и выше текста фразы» (как чип «Ловли слов»);
//   --pp-w2 / --pp-h2 — то же, но с накрытой строкой перевода (когда перевод открыт).
// Ширина фразы — по самому тексту (Range), а не по блоку: блок фразы растянут на всю ширину слайда.
// Следим за ResizeObserver (шрифты, перенос строк, смена модуля в той же копии слайда); depsKey — переподцепиться,
// когда меняется состав стопки (спойлер → открытая фраза, есть ли строка перевода).
const PAD_X = 10
const PAD_Y = 5

export function measurePlate(stack) {
  const phrase = stack.querySelector('.feedPhrase')
  if (!phrase) return
  const sub = stack.querySelector('.feedPhraseSub')
  const range = document.createRange()
  range.selectNodeContents(phrase)
  const textW = Math.ceil(range.getBoundingClientRect?.().width || phrase.offsetWidth)
  const top = phrase.offsetTop
  const h1 = phrase.offsetHeight
  let w2 = textW
  let h2 = h1
  if (sub) {
    const toggle = sub.firstElementChild
    w2 = Math.max(textW, toggle ? toggle.offsetWidth : 0)
    h2 = sub.offsetTop + sub.offsetHeight - top
  }
  const st = stack.style
  st.setProperty('--pp-y', `${top - PAD_Y}px`)
  st.setProperty('--pp-w', `${textW + PAD_X * 2}px`)
  st.setProperty('--pp-h', `${h1 + PAD_Y * 2}px`)
  st.setProperty('--pp-w2', `${w2 + PAD_X * 2}px`)
  st.setProperty('--pp-h2', `${h2 + PAD_Y * 2}px`)
}

export function usePhrasePlate(stackRef, depsKey) {
  useLayoutEffect(() => {
    const stack = stackRef.current
    if (!stack) return
    measurePlate(stack)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measurePlate(stack))
    const phrase = stack.querySelector('.feedPhrase')
    const sub = stack.querySelector('.feedPhraseSub')
    if (phrase) ro.observe(phrase)
    if (sub) ro.observe(sub)
    return () => ro.disconnect()
  }, [stackRef, depsKey])
}
