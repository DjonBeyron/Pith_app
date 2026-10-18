import { useEffect, useRef, useMemo } from 'react'
import { START_HINT_DELAY_MS, startHintText } from '../../../../shared/lib/speech/sayStartHint.js'

// Таймер подсказки «начать можно так…» (sayStartHint.js): пока active (панель ждёт ученика: микрофон не пишет, нет попапа/итога) идёт отсчёт START_HINT_DELAY_MS;
// любая запись, попап или уход сбрасывают его (вернулись в ожидание — отсчёт заново). Срабатывает один раз за модуль; подсказки нет (startHintText пуст) — таймер не заводим.
// Тишина: две тишины подряд (ученик ничего не сказал, sayFlow.SILENCE_EXIT_AT) — мягкая реплика «ничего страшного, двигаемся дальше» и закрытие панели как у «Я не могу говорить» (say_done без сообщения-успеха); панель делает это сама (SayPhrasePanel, silenceExit).
export function useSayStartHint({ data, active, onFire, delay = START_HINT_DELAY_MS }) {
  const text = useMemo(() => startHintText(data), [data])
  const fired = useRef(false)
  const fire = useRef(onFire)
  useEffect(() => { fire.current = onFire })
  useEffect(() => {
    if (!text || !active || fired.current) return undefined
    const t = setTimeout(() => { fired.current = true; fire.current?.(text) }, delay)
    return () => clearTimeout(t)
  }, [text, active, delay])
}
