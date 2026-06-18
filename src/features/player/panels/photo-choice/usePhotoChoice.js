import { useState } from 'react'

export function usePhotoChoice(node) {
  const photos         = node.typeData?.photo_choice?.photos         ?? []
  const correctIndexes = node.typeData?.photo_choice?.correctIndexes ?? []

  const [selected,    setSelected]    = useState(null)  // index or null
  const [result,      setResult]      = useState(null)  // 'correct' | 'wrong' | null
  const [galleryOpen, setGalleryOpen] = useState(false)

  const isAnswered = result !== null

  function handlePick(idx) {
    if (isAnswered) return
    const isCorrect = correctIndexes.includes(idx)
    setSelected(idx)
    setResult(isCorrect ? 'correct' : 'wrong')
    setGalleryOpen(false)
  }

  return { photos, correctIndexes, selected, result, isAnswered, galleryOpen, setGalleryOpen, handlePick }
}
