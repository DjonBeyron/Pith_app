import { useState, useMemo } from 'react'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function usePhraseAssembly(node) {
  const words       = node.typeData?.phrase_assembly?.words       ?? []
  const distractors = node.typeData?.phrase_assembly?.distractors ?? []

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

  const usedIdxs   = useMemo(() => new Set(placed.map(p => p.shuffleIdx)), [placed])
  const isAnswered = result === 'correct'

  function pickChip(shuffleIdx) {
    if (usedIdxs.has(shuffleIdx) || isAnswered) return
    const chip = shuffled[shuffleIdx]
    setPlaced(p => [...p, { shuffleIdx, word: chip.text, distractorId: chip.distractorId }])
    if (result === 'wrong') setResult(null)
  }

  function removePlaced(pos) {
    if (isAnswered) return
    setPlaced(p => p.filter((_, i) => i !== pos))
    setResult(null)
  }

  function checkAnswer() {
    if (placed.length === 0 || isAnswered) return null
    const placedWords = placed.map(p => p.word)
    const correct = placedWords.length === words.length &&
      words.every((w, i) => w.toLowerCase() === (placedWords[i] ?? '').toLowerCase())
    setResult(correct ? 'correct' : 'wrong')
    if (!correct) {
      setTimeout(() => {
        setPlaced([])
        setResult(null)
      }, 700)
    }
    return correct ? 'correct' : 'wrong'
  }

  return {
    shuffled, placed, usedIdxs, result, isAnswered,
    pickChip, removePlaced, checkAnswer,
  }
}
