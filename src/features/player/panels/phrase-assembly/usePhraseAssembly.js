import { useState, useMemo } from 'react'
import { firstMismatchSlot } from '../../../../shared/lib/signalMismatch.js'
import { signalForSlot } from '../../../../shared/lib/signalSlots.js'
import { useSignalState } from '../signal-overlay/useSignalState.js'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const wordMatches = (word, expected) => (word ?? '').toLowerCase() === expected.toLowerCase()

// nodes — все ноды урока (не только видимые): нужны, чтобы резолвить ref
// сигнала ошибки (см. PROJECT.md, «Сигналы ошибок») в живую ноду.
// onSignalFired(node, release, exerciseNodeId) — мост до ленты
// (PhraseAssemblyPanel → LessonPlayer/useSignalMessages.js): рисует сигнал
// обычным сообщением вместо прежнего оверлея, release === signalState.dismissOverlay
// ниже. hasSignalFired(nodeId) — та же нода-сигнал срабатывает один раз за урок.
export function usePhraseAssembly(node, nodes = [], onSignalFired, hasSignalFired) {
  const words       = node.typeData?.phrase_assembly?.words       ?? []
  const distractors = node.typeData?.phrase_assembly?.distractors ?? []
  const signals      = node.typeData?.phrase_assembly?.signals    ?? []

  // Shuffle once on mount (all chips: correct words + distractors) — единая
  // форма {text, distractorId}: distractorId нужен, чтобы при неверном
  // ответе понять, какое именно слово-ловушка попало в фразу (особый
  // переход конкретного варианта, nodeVariants.js), null у настоящих слов
  const [shuffled] = useState(() => shuffle([
    ...words.map(w => ({ text: w, distractorId: null })),
    ...distractors.map(d => ({ text: d.text, distractorId: d.id })),
  ]))

  // placed: [{ shuffleIdx, word, distractorId }, ...]
  const [placed, setPlaced] = useState([])
  const [result, setResult] = useState(null) // 'correct' | 'wrong' | null

  // Сигнал ошибки автора: пока его оверлей играет (freeze), ни новый чип, ни
  // удаление из зоны ответа не проходят — см. useSignalState.js
  const signalState = useSignalState()

  const usedIdxs   = useMemo(() => new Set(placed.map(p => p.shuffleIdx)), [placed])
  const isAnswered = result === 'correct'

  function pickChip(shuffleIdx) {
    if (usedIdxs.has(shuffleIdx) || isAnswered || signalState.freeze) return
    const chip = shuffled[shuffleIdx]
    setPlaced(p => [...p, { shuffleIdx, word: chip.text, distractorId: chip.distractorId }])
    if (result === 'wrong') setResult(null)
  }

  function removePlaced(pos) {
    if (isAnswered || signalState.freeze) return
    // Удаление любого чипа — та же самая, уже существующая механика (нет
    // отдельного «удали именно это слово из середины»), но мигание гасится,
    // только если убрали именно помеченный чип (см. nextBlinkIndex)
    signalState.onRemoved(pos)
    setPlaced(p => p.filter((_, i) => i !== pos))
    setResult(null)
  }

  function checkAnswer() {
    // signalState.freeze — защита от гонки при двойном клике/тапе по
    // «Проверить»: React мог ещё не успеть перерисовать disabled на кнопке
    // между двумя быстрыми кликами (см. useSignalMessages.js)
    if (placed.length === 0 || isAnswered || signalState.freeze) return null
    const placedWords = placed.map(p => p.word)
    const full = placedWords.length === words.length

    // Сигнал ошибки смотрим ТОЛЬКО на полностью собранном ответе — частичная
    // попытка (кнопка «Проверить» доступна и до конца сборки) идёт обычным
    // путём ниже, как и раньше
    if (full) {
      const mismatchIdx = firstMismatchSlot(placedWords, words, wordMatches)
      if (mismatchIdx == null) {
        setResult('correct')
        return 'correct'
      }
      // Сигнал есть И он ещё не срабатывал за этот урок — бесплатный; иначе
      // (нет сигнала, или уже срабатывал раньше) та же ошибка идёт обычным
      // путём ниже, как будто сигнала для этого слота вовсе нет
      const found = signalForSlot(signals, mismatchIdx, nodes)
      if (found && !hasSignalFired?.(found.node.id)) {
        // Панель НЕ закрывается и НЕ чистит собранное — сигнал «бесплатный»,
        // см. PROJECT.md. Мигает именно placed[mismatchIdx]
        signalState.fire(mismatchIdx, found.node)
        onSignalFired?.(found.node, signalState.dismissOverlay, node.id)
        return 'signal'
      }
    }

    setResult('wrong')
    setTimeout(() => {
      setPlaced([])
      setResult(null)
    }, 700)
    return 'wrong'
  }

  return {
    shuffled, placed, usedIdxs, result, isAnswered,
    pickChip, removePlaced, checkAnswer,
    blinkIndex: signalState.blinkIndex,
    freeze: signalState.freeze,
  }
}
