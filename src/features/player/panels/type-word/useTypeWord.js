import { useState, useMemo, useRef, useEffect } from 'react'
import { keyboardModel, typedMax, appendChar, removeLast, typedMatches } from '../../../../shared/lib/typeWordKeys.js'

const WRONG_FLASH_MS = 700

// Состояние «Напечатай слово»: что напечатано, итог проверки, замок после последней
// попытки. Счёт попыток, чат и закрытие панели — в самой панели (TypeWordPanel.jsx),
// как у «Собери фразу»: хук знает только про буквы.
export function useTypeWord(node) {
  const d = node.typeData?.type_word ?? {}
  const word  = d.word ?? ''
  const extra = d.extraLetters ?? ''
  const model = useMemo(() => keyboardModel(word, extra), [word, extra])
  const max = typedMax(word)

  const [typed, setTyped]   = useState('')
  const [result, setResult] = useState(null)   // 'correct' | 'wrong' | null
  const [locked, setLocked] = useState(false)  // последняя попытка — клавиши молчат до ухода панели
  const flashTimer = useRef(null)

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const isAnswered = result === 'correct'
  const frozen = isAnswered || locked

  function press(ch) {
    if (frozen) return
    setTyped(t => appendChar(t, ch, max))
    if (result === 'wrong') setResult(null)
  }

  function backspace() {
    if (frozen) return
    setTyped(removeLast)
    if (result === 'wrong') setResult(null)
  }

  // Итог проверки: 'correct' | 'wrong' | null (нечего проверять). Красная тряска
  // гаснет сама, собранное не чистим — ученик правит по месту, как в «Собери фразу»
  function check() {
    if (!typed.trim() || frozen) return null
    clearTimeout(flashTimer.current)
    if (typedMatches(typed, word)) {
      setResult('correct')
      return 'correct'
    }
    setResult('wrong')
    flashTimer.current = setTimeout(() => setResult(null), WRONG_FLASH_MS)
    return 'wrong'
  }

  return {
    typed, result, isAnswered, frozen, model, word,
    press, backspace, check, lock: () => setLocked(true),
  }
}
