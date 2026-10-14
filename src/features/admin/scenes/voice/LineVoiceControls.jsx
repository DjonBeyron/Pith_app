import { Play, Square, Mic, RefreshCw, Trash2 } from 'lucide-react'
import { fmtDuration } from './voiceGenerate.js'
import { voiceName } from './voicePresets.js'
import { STATE_LABEL, lineVoiceStatus } from './voiceStatus.js'
import ScTip from '../ScTip.jsx'

// Строка озвучки реплики в таймлайне: бейдж статуса (нет файла / озвучено + длительность /
// устарело / озвучиваю… / ошибка — voiceStatus.js) и кнопки «Озвучить» / «Прослушать» /
// «Переозвучить» / «Удалить озвучку». voice — API useSceneVoice; без него (статичный
// рендер) — только бейдж. id f-timeline-<i>-audioUrl — подсветка «озвучка устарела».

export default function LineVoiceControls({ index: i, line, character, voice = null, idPrefix }) {
  const rt = voice?.lines?.[i]
  const status = lineVoiceStatus(line, character, rt)
  const hasAudio = !!line.audioUrl
  const dur = fmtDuration(line.audioMeta?.durationMs)
  const lock = !!voice?.busy
  const canVoice = !!voice && !lock && !!String(line.text ?? '').trim()
  const isPlaying = voice?.playing === i

  return (
    <div className={`scbVoiceRow scbVoiceRow-${status}`} id={`${idPrefix}-audioUrl`}>
      <span className="scbVoiceInfo">
        Аудио: <span className={`scbVoiceTag scbVoiceTag-${status}`}>{STATE_LABEL[status]}{status === 'ready' && dur ? ` · ${dur}` : ''}</span>
        {hasAudio && status !== 'error' && line.audioMeta?.voiceId && <span className="scbSub"> · {voiceName(line.audioMeta.voiceId)}</span>}
        {status === 'error' && <span className="scbVoiceErr" role="alert"> {rt.error}</span>}
        {status === 'stale' && <span className="scbSub"> — текст или голос изменились после озвучки</span>}
        {status === 'none' && !hasAudio && <ScTip help="audio_status" />}
      </span>
      {voice && (
        <span className="scbVoiceBtns">
          {hasAudio && (
            <button type="button" className="scbIcon" onClick={() => voice.playLine(i)} aria-label={isPlaying ? 'Остановить' : 'Прослушать'} title={isPlaying ? 'Остановить' : 'Прослушать'}>
              {isPlaying ? <Square size={14} /> : <Play size={14} />}
            </button>
          )}
          {!hasAudio && (
            <button type="button" className="fsBtn fsBtnSmall" onClick={() => voice.voiceLine(i)} disabled={!canVoice} title="Сгенерировать озвучку этой реплики через ElevenLabs">
              <Mic size={13} /> {status === 'error' ? 'Повторить' : 'Озвучить'}
            </button>
          )}
          {hasAudio && (
            <button type="button" className={status === 'stale' ? 'fsBtn fsBtnSmall fsBtnPrimary' : 'fsBtn fsBtnSmall'} onClick={() => voice.voiceLine(i, { force: true })} disabled={!canVoice} title="Сгенерировать заново (старый файл удалится)">
              <RefreshCw size={13} /> Переозвучить
            </button>
          )}
          {hasAudio && (
            <button type="button" className="scbIcon scbIconDanger" onClick={() => voice.removeLineAudio(i)} disabled={lock} aria-label="Удалить озвучку" title="Удалить файл и очистить поля озвучки">
              <Trash2 size={14} />
            </button>
          )}
        </span>
      )}
    </div>
  )
}
