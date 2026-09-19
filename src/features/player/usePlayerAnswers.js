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
  // Галочка «отправить таблицу в чат»: после разбора таблица остаётся
  // в переписке отдельным сообщением (TableModule рисует пузырь)
  const [tableSent, setTableSent]                 = useState({})
  // Пока панель летит в чат (flyPanelToChat.js), пузырь уже стоит в ленте и
  // держит место под посадку — но видимым быть не должен: иначе таблица
  // разом видна и в панели, и в переписке
  const [tableArriving, setTableArriving]         = useState({})

  // arriving — пузыри уже вставлены в ленту, но ещё НЕВИДИМЫ (место занято):
  // панель закрывается тем же тиком, и история опускается ровно до места,
  // которое останется после прихода ответа. Когда панель ушла, панель зовёт
  // handleWordReveal — пузыри въезжают снизу, историю двигать уже не надо
  // (WordChoiceModule / useDeferredArrival.js)
  function handleWordAnswer(nodeId, text, result, arriving = false) {
    setWordChoiceStates(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], text, result, arriving } }))
  }

  function handleWordReveal(nodeId) {
    setWordChoiceStates(prev => (prev[nodeId]?.arriving
      ? { ...prev, [nodeId]: { ...prev[nodeId], arriving: false } }
      : prev))
  }

  // Выбранный вариант как реплика ученика — только если у ноды включена
  // галочка «Отправлять выбранное в чат». Приходит одним тиком с реакцией
  // (handleWordAnswer), панель решает когда
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

  // arriving — таблицу несёт полёт панели: пузырь монтируем невидимым и
  // показываем только по markTableLanded. Без полёта (нет Web Animations)
  // приходит false, и пузырь виден сразу
  // sent — как таблица выглядела в панели на момент отправки:
  // { words, result }. Пузырь в чате повторяет этот вид, чтобы посадка
  // панели не превращалась в подмену на что-то другое
  function markTableSent(nodeId, arriving = false, sent = null) {
    setTableSent(prev => (prev[nodeId] ? prev : { ...prev, [nodeId]: sent ?? true }))
    if (arriving) setTableArriving(prev => ({ ...prev, [nodeId]: true }))
  }

  function markTableLanded(nodeId) {
    setTableArriving(prev => {
      if (!prev[nodeId]) return prev
      const n = { ...prev }; delete n[nodeId]; return n
    })
  }

  function handleRegAnswer(nodeId, text, result) {
    setRegStates(prev => ({ ...prev, [nodeId]: [...(prev[nodeId] ?? []), { text, result }] }))
  }

  // Шаг «назад» в админском прогоне: нода снимается с ленты и должна снова
  // спрашивать — забываем всё, что по ней уже ответили
  function resetNode(nodeId) {
    const drop = prev => { const n = { ...prev }; delete n[nodeId]; return n }
    setWordChoiceStates(drop)
    setPhraseStates(drop)
    setPhotoChoiceStates(drop)
    setRegStates(drop)
    setTableSent(drop)
    setTableArriving(drop)
  }

  return {
    resetNode,
    photoChoiceStates, setPhotoChoiceStates,
    wordChoiceStates, handleWordAnswer, handleWordPick, handleWordReveal,
    phraseStates, handlePhraseAnswer,
    regStates, handleRegAnswer,
    tableSent, markTableSent,
    tableArriving, markTableLanded,
  }
}
