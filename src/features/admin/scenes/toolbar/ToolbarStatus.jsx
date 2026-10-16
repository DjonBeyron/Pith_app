// Индикаторы состояния в тулбаре сборщика: озвучка «озвучено X из N · перевод Y из M · устарело Z» (sceneVoiceStats) и остаток квоты
// ElevenLabs. Чистая разметка по пропсам. Новые индикаторы — ещё одним <li>.
// (статус «Черновик · не сохранена» — теперь у названия сцены, SceneTitleField); voice — sceneVoiceStats(scene) | null;
// quotaLeft — остаток символов | null; modes — { any: предпросмотр ≠ сцена } | null.
export default function ToolbarStatus({ voice = null, quotaLeft = null, modes = null }) {
  const tr = voice?.translation
  const stale = voice ? voice.stale + (tr?.stale ?? 0) : 0
  return (
    <ul className="scbTbStatus" aria-label="Состояние сцены">
      {voice && (
        <li className={stale > 0 ? 'scbTbChip scbTbChipWarn' : 'scbTbChip scbTbChipMute'} title={tr?.withText ? `оригинал ${voice.ready} из ${voice.total} · перевод ${tr.ready} из ${tr.withText} реплик с переводом` : undefined}>
          озвучено {voice.ready} из {voice.total}{tr?.withText > 0 ? ` · перевод ${tr.ready} из ${tr.withText}` : ''}{stale > 0 ? ` · устарело ${stale}` : ''}
        </li>
      )}
      {quotaLeft != null && <li className="scbTbChip scbTbChipMute" title="Остаток символов ElevenLabs">квота {quotaLeft.toLocaleString('ru-RU')} симв.</li>}
      {modes?.any && <li className="scbTbChip scbTbChipAccent" title="Режим показа/озвучки в предпросмотре отличается от записанного в сцене — «Сделать по умолчанию» запишет его">предпросмотр ≠ сцена</li>}
    </ul>
  )
}
