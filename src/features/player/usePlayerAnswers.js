import { useState } from 'react'

// Локальное состояние ответов игрока по типам интерактивных нод (что выбрал,
// правильно/неправильно) — используется для подсветки в чате (PlayerMessage)
// и данных панелей. Вынесено из LessonPlayer.jsx — самодостаточный кусок
// state, не завязанный на XP/статистику/финиш урока.
export function usePlayerAnswers() {
  const [photoChoiceStates, setPhotoChoiceStates] = useState({})
  const [wordChoiceStates, setWordChoiceStates]   = useState({})
  const [phraseStates, setPhraseStates]           = useState({})
  const [regStates, setRegStates]                 = useState({})
  // XP pending for photo_choice: fires when the correct photo bubble mounts in chat
  const [pendingPhotoXp, setPendingPhotoXp] = useState({})

  function handleWordAnswer(nodeId, text, result) {
    setWordChoiceStates(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], text, result } }))
  }

  // Выбранный вариант как реплика ученика — прилетает в чат сразу по тапу,
  // раньше текста реакции (тот приходит через handleWordAnswer с задержкой).
  // Только если у ноды включена галочка «Отправлять выбранное в чат».
  function handleWordPick(nodeId, pickText) {
    setWordChoiceStates(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], pickText } }))
  }

  function handlePhraseAnswer(nodeId, text, result) {
    setPhraseStates(prev => {
      const arr = prev[nodeId] ?? []
      if (result === 'wrong' && arr.some(b => b.result === 'wrong')) return prev
      return { ...prev, [nodeId]: [...arr, { text, result }] }
    })
  }

  function handleRegAnswer(nodeId, text, result) {
    setRegStates(prev => ({ ...prev, [nodeId]: [...(prev[nodeId] ?? []), { text, result }] }))
  }

  return {
    photoChoiceStates, setPhotoChoiceStates,
    wordChoiceStates, handleWordAnswer, handleWordPick,
    phraseStates, handlePhraseAnswer,
    regStates, handleRegAnswer,
    pendingPhotoXp, setPendingPhotoXp,
  }
}
