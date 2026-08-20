import { useEffect, useRef } from 'react'

// Память высоты текстового поля ноды. Уголок ресайза у textarea — нативный,
// браузер просто пишет inline height и забывает его при перезагрузке. Здесь
// высота запоминается на конкретное поле конкретной ноды и восстанавливается
// при следующем открытии.
//
// key — стабильный идентификатор поля, например `${node.id}:content`.
// enabled=false в продакшен-списке: там поля растут под содержимое сами
// (autoGrowTextarea), и запомненная высота с этим конфликтовала бы.
const PREFIX = 'nodeTextH:'

export function useTextareaHeight(key, enabled = true) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || !key) return
    const store = PREFIX + key

    try {
      const saved = parseInt(localStorage.getItem(store), 10)
      if (Number.isFinite(saved) && saved > 0) el.style.height = saved + 'px'
    } catch { /* приватный режим */ }

    // Первое срабатывание — это само появление поля, а не действие человека:
    // иначе мы бы записали дефолтную высоту и навсегда закрепили её
    let first = true
    let timer = null
    const ro = new ResizeObserver(() => {
      if (first) { first = false; return }
      clearTimeout(timer)
      timer = setTimeout(() => {
        try { localStorage.setItem(store, String(Math.round(el.offsetHeight))) } catch { /* приватный режим */ }
      }, 300)
    })
    ro.observe(el)
    return () => { clearTimeout(timer); ro.disconnect() }
  }, [key, enabled])

  return ref
}
