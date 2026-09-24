import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { dbg } from '../../shared/lib/debug.js'

// Скроллер цепочки: контейнер .moduleGraphScroll, а если он не скроллится
// (высота не ограничена — скроллит страница), то фолбэк на window.
function getScroller(cont) {
  if (cont && cont.scrollHeight > cont.clientHeight + 4) {
    return {
      kind: 'container',
      get:  () => cont.scrollTop,
      set:  v  => { cont.scrollTop = v },
      base: () => cont.getBoundingClientRect().top,
      view: cont.clientHeight,
    }
  }
  return {
    kind: 'window',
    get:  () => window.scrollY,
    set:  v  => window.scrollTo(0, v),
    base: () => 0,
    view: window.innerHeight,
  }
}

// Скролл графа модуля после урока: мгновенно ставит пройденный урок к верху
// экрана; scrollToFinal(durMs) плавно везёт вниз к финалу за durMs
// (время полёта первого кружочка XP).
//
// Сам проезд — не scrollTop каждый кадр из JS, а CSS-переход transform у
// содержимого (innerRef): его ведёт видеокарта, и он не спотыкается, когда
// JS в этот кадр занят (путь кружочков, ре-рендер схемы на касании, снятие
// замков). В конце — в одном кадре — transform снимается и ставится
// настоящий scrollTop в ту же точку: на экране ничего не дёргается.
// Раньше scrollTop из rAF на слабом Android заметно лагал.
export function useChainScroll({ justCompleted, lessons, scrollRef, innerRef, startRef, finalRef, lessonRefs }) {
  // useLayoutEffect: скролл ставится ДО отрисовки кадра — при выходе из урока
  // пользователь сразу видит пройденный урок сверху, без прыжка.
  useLayoutEffect(() => {
    if (!justCompleted) return
    const idx = lessons.findIndex(l => l.id === justCompleted.id)
    const el = idx === 0 ? startRef.current
      : idx === lessons.length - 1 ? finalRef.current
      : lessonRefs.current[idx - 1]
    if (!el) { dbg('[SCROLL] top: нет элемента урока, idx=', idx); return }
    const s = getScroller(scrollRef.current)
    // Отступ 56px: зелёное свечение пройденного нода (drop-shadow 18px ≈ 27px
    // видимого рассеивания + пульс scale 1.03) не должно резаться верхним краем
    // скролл-контейнера. Тулбар над ним прозрачный — срез было бы отлично видно.
    // Для Старта (idx 0) упирается в 0 и он встаёт на padding-top контента
    const target = Math.max(0, el.getBoundingClientRect().top + s.get() - s.base() - 56)
    dbg('[SCROLL] top:', s.kind, 'idx=', idx, 'target=', Math.round(target), 'до=', Math.round(s.get()))
    s.set(target)
    dbg('[SCROLL] top: после=', Math.round(s.get()))
  }, [justCompleted]) // eslint-disable-line react-hooks/exhaustive-deps

  const animRef = useRef(null)
  const finishRef = useRef(null)
  useEffect(() => () => { cancelAnimationFrame(animRef.current); finishRef.current?.() }, [])

  const scrollToFinal = useCallback((durMs) => {
    const finalEl = finalRef.current
    if (!finalEl) { dbg('[SCROLL] к финалу: нет финала'); return }
    const s = getScroller(scrollRef.current)
    const r = finalEl.getBoundingClientRect()
    // 44px под нижней гранью нода: там разворачивается церемония открытия
    // (mgFinalBurst + ореол mgHaloBurst) — с прежними 16px её рассеивание
    // срезалось нижним краем контейнера ровной линией
    // Не дальше, чем реально можно проскроллить: иначе transform уехал бы
    // дальше, чем потом встанет scrollTop, и в конце был бы скачок
    const max = s.kind === 'container'
      ? scrollRef.current.scrollHeight - scrollRef.current.clientHeight
      : document.documentElement.scrollHeight - window.innerHeight
    const target = Math.min(Math.max(0, max), Math.max(0, r.top + s.get() - s.base() + r.height - s.view + 44))
    const from = s.get()
    const dist = target - from
    dbg('[SCROLL] к финалу:', s.kind, 'dur=', Math.round(durMs),
      'from=', Math.round(from), 'target=', Math.round(target))
    cancelAnimationFrame(animRef.current)
    finishRef.current?.()
    const inner = innerRef?.current
    if (!inner || Math.abs(dist) < 1) { s.set(target); return }

    // Ниже — прямая работа со стилем DOM-элемента содержимого (анимация
    // вне React), это не мутация пропсов/состояния
    /* eslint-disable react-hooks/immutability */

    let done = false
    let fallback = null
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(fallback)
      inner.removeEventListener('transitionend', onEnd)
      inner.style.transition = 'none'
      inner.style.transform = ''
      inner.style.willChange = ''
      s.set(target) // тот же кадр — содержимое остаётся на месте
      finishRef.current = null
      dbg('[SCROLL] к финалу: доехали, scroll=', Math.round(s.get()))
    }
    const onEnd = e => { if (e.target === inner && e.propertyName === 'transform') finish() }
    finishRef.current = finish
    inner.addEventListener('transitionend', onEnd)
    inner.style.willChange = 'transform'
    inner.style.transition = 'none'
    inner.style.transform = 'translate3d(0, 0, 0)'
    // Следующий кадр — старт перехода от уже отрисованного нуля
    animRef.current = requestAnimationFrame(() => {
      inner.style.transition = `transform ${Math.round(durMs)}ms linear`
      inner.style.transform = `translate3d(0, ${-dist}px, 0)`
    })
    // Страховка: transitionend может не прийти (вкладка в фоне и т.п.)
    fallback = setTimeout(finish, durMs + 150)
    /* eslint-enable react-hooks/immutability */
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return scrollToFinal
}
