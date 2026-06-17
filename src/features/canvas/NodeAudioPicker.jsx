function truncate(name, max = 20) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

// File picker for audio-type nodes. Picks from local disk; parent calls onPick(File)
// which adds it to useLessonFiles and updates node.file_id.
export default function NodeAudioPicker({ fileId, lessonFiles, onPick }) {
  const file = lessonFiles.find(f => f.id === fileId) ?? null

  function handleChange(e) {
    const f = e.target.files[0]
    if (f) onPick(f)
    e.target.value = ''
  }

  return (
    <div className="nodeAudioPicker" onClick={e => e.stopPropagation()}>
      <label className="nodeAudioPickerLabel">
        <input
          type="file"
          accept="audio/*"
          className="nodeAudioInput"
          onChange={handleChange}
        />
        <span className="nodeAudioPickerBtn">
          {file ? truncate(file.name) : '+ Выбрать аудио'}
        </span>
      </label>
      {file && (
        <span
          className={`nodeAudioStatus ${file.status === 'synced' ? 'nodeAudioStatusSynced' : 'nodeAudioStatusLocal'}`}
          title={file.status === 'synced' ? 'На сервере' : 'Локально, не загружено'}
        >
          {file.status === 'synced' ? '↑' : '○'}
        </span>
      )}
    </div>
  )
}
