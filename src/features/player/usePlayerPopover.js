import { useCallback, useEffect, useState } from 'react'

// Поповер из шапки урока (меню скорости, шестерёнка) рисуется ПОРТАЛОМ в
// .lessonPlayer, а не внутри шапки. Причина: шапка (.playerTopBar, z-index 5)
// лежит в контексте наложения плеера, где панели ответа (80), растушёвка низа
// (90), свечение (95), фото (400) и кружок выше неё — меню, оставшееся внутри
// шапки, уходило под них. В .lessonPlayer у меню свой слой (z-index 500, см.
// settings-menu.css / volume-menu.css) поверх всего плеера; на десктопе
// .lessonPlayer лежит в рамке «телефона», так что меню остаётся в рамке.
// Полноэкранное видео и итоги урока — соседи плеера в body (z 10000+), они
// по-прежнему выше: это экраны, а не модули.
//
// Положение считаем по рамке .lessonPlayer в момент открытия и на resize:
// top — под anchor (или под ближайшим barSelector), right — от правого края
// того же элемента. Нет .lessonPlayer (редкий случай) — fixed в body по окну.
export function usePlayerPopover(anchorRef, { gap = 4, rightInset = 0, barSelector = null } = {}) {
  const [pop, setPop] = useState(null)   // null = закрыто; { host, style } = открыто

  const measure = useCallback(() => {
    const el = anchorRef.current
    if (!el) return null
    const host = el.closest('.lessonPlayer')
    const bar = (barSelector && el.closest(barSelector)) || el
    const h = host
      ? host.getBoundingClientRect()
      : { top: 0, right: window.innerWidth, height: window.innerHeight }
    const r = bar.getBoundingClientRect()
    const top = Math.round(r.bottom - h.top + gap)
    const right = Math.round(h.right - r.right + rightInset)
    return {
      host: host ?? document.body,
      style: { position: host ? 'absolute' : 'fixed', top, right, maxHeight: Math.max(120, Math.round(h.height - top - 8)) },
    }
  }, [anchorRef, gap, rightInset, barSelector])

  const open = pop !== null
  useEffect(() => {
    if (!open) return
    const onResize = () => setPop(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, measure])

  const toggle = useCallback(() => setPop(open ? null : measure()), [open, measure])
  const close = useCallback(() => setPop(null), [])
  return { open, host: pop?.host ?? null, style: pop?.style ?? null, toggle, close }
}
