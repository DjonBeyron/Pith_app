// Текст плашки по центру экрана игры (WordLaneTurnPlate): «название\nзадание» у объявления раунда / этапа, «Теперь твоя очередь» у хода ученика. cap — подпись неозвученной реплики Пита
// («Встряхни память», raceSilentLine.plateCaption): третьей строкой «название\nзадание\nподпись»; у объявления без названия (второй круг, проход B) плашка из одной подписи — игрок понимает задание.
export function plateText(st, cap = '') {
  const base = st?.type === 'announce' ? [st.round?.title, st.round?.brief ?? st.round?.task].filter(Boolean).join('\n') : st?.type === 'turn' ? 'Теперь твоя очередь' : ''
  if (!cap || st?.type !== 'announce') return base
  const [title = '', task = ''] = base.split('\n')
  return `${title}\n${task}\n${cap}`
}
