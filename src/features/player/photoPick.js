// Ответ ученика в «выбери фото» (панель photo_choice): счётчик ошибок,
// запись в анализ знаний, состояние панели, XP за верный ответ и переход
// графа. Вынесено из LessonPlayer.jsx (тот упирался в потолок 400 строк);
// всё нужное плееру приходит первым аргументом
export function pickPhoto({ nodes, wrongRef, record, setPhotoChoiceStates, xpMap, handleXpEarned, onNodeDone }, nodeId, idx, isCorrect) {
  const result = isCorrect ? 'photo_correct' : 'photo_wrong'
  if (!isCorrect) wrongRef.current += 1
  const pcNode = nodes.find(n => n.id === nodeId)
  // Особый переход этого конкретного фото (nodeVariants.js), если задан —
  // проверяется раньше общего верно/неверно (useGraphPlayer.onNodeDone)
  const variantId = pcNode?.typeData?.photo_choice?.photos?.[idx]?.id ?? null
  record({
    nodeId,
    lessonId: pcNode?.typeData?.photo_choice?.statLessonId ?? null,
    type: isCorrect ? 'correct' : 'wrong',
    option: `фото #${idx + 1}`,
  })
  setPhotoChoiceStates(prev => ({ ...prev, [nodeId]: { selected: idx, result: isCorrect ? 'correct' : 'wrong' } }))
  if (isCorrect) {
    const xp = xpMap.get(nodeId) ?? 0
    // Плитка галереи, по которой ткнули, уже помечена панелью (rememberTap):
    // галерея сейчас закроется, но замер сделан. Пузырь с фото всё равно
    // появится, и цифра стартует от него — плитка тут запасной вариант
    if (xp > 0) handleXpEarned(xp, nodeId)
  }
  onNodeDone(nodeId, result, variantId)
}
