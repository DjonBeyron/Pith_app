import { useEffect, useRef } from 'react'

// Авто-ответ админа (SolveCorrectButton) ставит состояние панели целиком —
// setPlaced/setPicked/setAssembled/setTyped — а проверка панели (check/
// checkAnswer) замыкает значения ТЕКУЩЕГО рендера: позвать её в том же тике
// нельзя, она увидела бы пустой ответ. Хук решает это без второго источника
// правды: arm() перед setState, и после коммита рендера с новым значением
// `dep` эффект один раз зовёт run (проверку из уже свежего рендера). Обычные
// изменения dep (тапы ученика) эффект не трогают — без arm он молчит.
export function useSolveAfterRender(dep, run) {
  const armed = useRef(false)
  useEffect(() => {
    if (!armed.current) return
    armed.current = false
    run()
  }, [dep]) // eslint-disable-line react-hooks/exhaustive-deps
  return () => { armed.current = true }
}
