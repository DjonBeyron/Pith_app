import { useEffect, useRef } from 'react'
import { pLog } from '../../shared/lib/debug.js'

// Офсет триггера «Воспроизведено до конца» (галочка в NodeTriggerEditor):
// минус — сработать РАНЬШЕ конца медиа (следующая нода готовится, пока звук
// ещё идёт), плюс — позже (медиа + пауза). Дефолт при включении — 0.7 сек.
export const DEFAULT_PLAYED_OFFSET_MS = 700

// Офсет ноды в мс: 0, если галочка снята или триггера played нет.
export function playedOffsetMs(node) {
  const t = (node?.triggers ?? []).find(tr => tr.if === 'played' && tr.offsetOn)
  return t ? (t.offsetMs ?? DEFAULT_PLAYED_OFFSET_MS) : 0
}

// Ранний запуск: зовёт fire() за |offsetMs| до конца воспроизведения.
// Положительный офсет (пауза после конца) сюда не попадает — его отрабатывает
// useGraphPlayer, когда медиа уже доиграло.
//
// getEls — функция, отдающая media-элемент или их массив (у видео их два:
// inline и полноэкранный). Опрос интервалом, а не 'timeupdate', потому что
// элемент появляется позже маунта (ждём blob) и подменяется при переходе в
// полный экран — подписка на конкретный узел этого бы не пережила.
export function usePlayedOffset(offsetMs, getEls, fire) {
  const firedRef  = useRef(false)
  const fireRef   = useRef(fire)
  const getElsRef = useRef(getEls)

  // Свежие колбэки — после рендера: писать в ref во время рендера запрещено
  // (react-hooks/refs), а в deps интервала их держать нельзя — пересоздавался
  // бы каждый рендер
  useEffect(() => {
    fireRef.current   = fire
    getElsRef.current = getEls
  })

  useEffect(() => {
    if (!(offsetMs < 0)) return
    const lead = Math.abs(offsetMs) / 1000
    firedRef.current = false

    const id = setInterval(() => {
      if (firedRef.current) return
      const raw = getElsRef.current?.()
      const els = (Array.isArray(raw) ? raw : [raw]).filter(Boolean)
      for (const el of els) {
        // loop — беззвучная петля после первого проигрывания (videoAutoSound),
        // её «конец» к триггеру отношения не имеет
        if (el.paused || el.loop) continue
        const d = el.duration
        if (!Number.isFinite(d) || d <= 0) continue
        if (d - el.currentTime > lead) continue
        firedRef.current = true
        clearInterval(id)
        pLog(`[played-offset] раньше конца на ${lead.toFixed(2)}с (длина ${d.toFixed(2)}с)`)
        fireRef.current?.()
        return
      }
    }, 80)

    return () => clearInterval(id)
  }, [offsetMs])
}
