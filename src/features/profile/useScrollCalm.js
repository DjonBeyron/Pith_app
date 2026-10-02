import { useRef, useCallback, useEffect } from 'react'

// «Затишье» блеска карточек профиля (profile-shine.css), пока идёт прокрутка: класс pvScreen--calm вешается прямо на
// DOM-элемент, без состояния React — перерисовок на каждый кадр прокрутки нет (так же в схеме модуля: блик на паузе при
// скролле). Вешать результат на onScroll прокручиваемого контейнера
export function useScrollCalm(ms = 180) {
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  return useCallback(e => {
    const el = e.currentTarget
    el.classList.add('pvScreen--calm')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => el.classList.remove('pvScreen--calm'), ms)
  }, [ms])
}
