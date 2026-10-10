// Остановить воспроизведение голосовых ответов ученика (пузыри «голосовое с текстом» в чате): вызывается в тапе, который начинает новую запись — своя речь из динамика не должна
// попасть в микрофон и не должна мешать попытке. <audio> пузыря помечен data-say-voice; ищем по документу, без реестра элементов.
export function pauseSayVoices(root = typeof document !== 'undefined' ? document : null) {
  if (!root?.querySelectorAll) return 0
  let n = 0
  root.querySelectorAll('audio[data-say-voice]').forEach(a => { if (!a.paused) { try { a.pause(); n++ } catch { /* элемент выгружен */ } } })
  return n
}
