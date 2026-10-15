// Индикаторы состояния в тулбаре сборщика: в библиотеке / не в библиотеке, несохранённые
// правки, озвучка «озвучено X из N» (+ устарело) и остаток квоты ElevenLabs. Чистая
// разметка по пропсам. Новые индикаторы (например озвучка перевода) — ещё одним <li>.
// saved — draft.saved; unsaved — есть правки, которые не сохранены; voice — { ready, total, stale } | null;
// quotaLeft — остаток символов | null.
export default function ToolbarStatus({ saved, unsaved, voice = null, quotaLeft = null }) {
  const inLib = !!saved.id
  return (
    <ul className="scbTbStatus" aria-label="Состояние сцены">
      <li className={inLib ? 'scbTbChip' : 'scbTbChip scbTbChipMute'}>
        {inLib ? `в библиотеке · ${saved.status === 'published' ? 'опубликована' : 'черновик'}` : 'не в библиотеке'}
      </li>
      <li className={unsaved ? 'scbTbChip scbTbChipWarn' : 'scbTbChip scbTbChipMute'}>
        {unsaved ? 'есть несохранённое' : 'всё сохранено'}
      </li>
      {voice && (
        <li className={voice.stale > 0 ? 'scbTbChip scbTbChipWarn' : 'scbTbChip scbTbChipMute'}>
          озвучено {voice.ready} из {voice.total}{voice.stale > 0 ? ` · устарело ${voice.stale}` : ''}
        </li>
      )}
      {quotaLeft != null && <li className="scbTbChip scbTbChipMute" title="Остаток символов ElevenLabs">квота {quotaLeft.toLocaleString('ru-RU')} симв.</li>}
    </ul>
  )
}
