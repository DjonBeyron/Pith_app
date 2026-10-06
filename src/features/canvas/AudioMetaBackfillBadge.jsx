// Надпись «Спектр: 3/12…» в шапке канваса, пока useAudioMetaBackfill.js
// досчитывает волну/длительность голосовых. Когда всё есть — ничего не
// рисует. Без модалок: это фоновая работа, автору достаточно знать, что она
// идёт и что потом нужно сохранить урок
export default function AudioMetaBackfillBadge({ progress }) {
  if (!progress) return null
  return (
    <span
      className="ambBadge"
      title="Считаю спектр и длительность голосовых без сохранённой меты — после окончания сохрани урок"
    >
      Спектр: {progress.done}/{progress.total}…
    </span>
  )
}
