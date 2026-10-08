import { useState, useMemo, useRef, useEffect } from 'react'
import {
  keyboardModel, typedMax, appendChar, removeLast, typedMatches, typedMismatchSlot, wordLetters,
} from '../../../../shared/lib/typeWordKeys.js'
import { signalForSlot } from '../../../../shared/lib/signalSlots.js'
import { useSignalState } from '../signal-overlay/useSignalState.js'

const WRONG_FLASH_MS = 700

// Состояние «Напечатай слово»: что напечатано, итог проверки, замок после последней
// попытки. Счёт попыток, чат и закрытие панели — в самой панели (TypeWordPanel.jsx),
// как у «Собери фразу»: хук знает только про буквы.
//
// Сигналы ошибок (как у «Собери фразу», см. usePhraseAssembly.js и PROJECT.md): слот —
// позиция БУКВЫ слова. Первая неверная буква напечатанного (typedMismatchSlot) + сигнал
// автора на этот слот + нода-сигнал ещё не срабатывала за урок → «бесплатная» ошибка:
// сообщение-сигнал уходит в ленту (onSignalFired), неверная буква мигает, клавиши молчат,
// пока сигнал играет, попытка не тратится. nodes — все ноды урока (резолв ref сигнала),
// hasSignalFired(nodeId) — та же нода-сигнал срабатывает один раз за урок.
export function useTypeWord(node, nodes = [], onSignalFired, hasSignalFired) {
  const d = node.typeData?.type_word ?? {}
  const word  = d.word ?? ''
  const extra = d.extraLetters ?? ''
  const signals = d.signals ?? []
  const model = useMemo(() => keyboardModel(word, extra), [word, extra])
  const max = typedMax(word)

  const [typed, setTyped]   = useState('')
  const [result, setResult] = useState(null)   // 'correct' | 'wrong' | null
  const [locked, setLocked] = useState(false)  // последняя попытка — клавиши молчат до ухода панели
  const flashTimer = useRef(null)
  const signalState = useSignalState()

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const isAnswered = result === 'correct'
  const frozen = isAnswered || locked || signalState.freeze

  function press(ch) {
    if (frozen) return
    setTyped(t => appendChar(t, ch, max))
    if (result === 'wrong') setResult(null)
  }

  // Авто-ответ админа (SolveCorrectButton): строка целиком вместо нажатий по
  // буквам (solveCorrect.js) — замок и сигнал держат так же, как press
  function setAll(text) {
    if (frozen) return
    setTyped(text)
    if (result === 'wrong') setResult(null)
  }

  // Мигание гаснет, когда стёрли именно помеченную букву (индекс — позиция буквы без пробелов)
  function backspace() {
    if (frozen) return
    const letters = wordLetters(typed).length
    if (letters > 0 && typed.slice(-1) !== ' ') signalState.onRemoved(letters - 1)
    setTyped(removeLast)
    if (result === 'wrong') setResult(null)
  }

  // Итог проверки: 'correct' | 'wrong' | 'signal' | null (нечего проверять). Красная тряска
  // гаснет сама, собранное не чистим — ученик правит по месту, как в «Собери фразу»
  function check() {
    if (!typed.trim() || frozen) return null
    clearTimeout(flashTimer.current)
    if (typedMatches(typed, word)) {
      setResult('correct')
      return 'correct'
    }
    const slot = typedMismatchSlot(typed, word)
    const found = slot == null ? null : signalForSlot(signals, slot, nodes)
    if (found && !hasSignalFired?.(found.node.id)) {
      // Панель НЕ закрывается и ничего не чистит — сигнал «бесплатный» (PROJECT.md)
      signalState.fire(slot, found.node)
      onSignalFired?.(found.node, signalState.dismissOverlay, node.id)
      return 'signal'
    }
    setResult('wrong')
    flashTimer.current = setTimeout(() => setResult(null), WRONG_FLASH_MS)
    return 'wrong'
  }

  return {
    typed, result, isAnswered, frozen, model, word,
    blinkIndex: signalState.blinkIndex,
    press, backspace, setAll, check, lock: () => setLocked(true),
  }
}
