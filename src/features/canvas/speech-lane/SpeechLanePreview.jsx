import SpeechLaneStage from '../../../shared/ui/SpeechLaneStage.jsx'
import { fmtAudioTime, WAVEFORM_FPS } from '../../../shared/lib/audioUtils.js'
import { timelineToFileTime } from '../../../shared/lib/audioClips.js'

// Предпросмотр над дорожками — альбомный «телефон» с той же сценой, что
// увидит ученик (SpeechLaneStage): где слова в момент плейхеда, что горит,
// какой перевод сверху. Круг дышит по волне озвучки — тот же источник, что
// в плеере для диктора (waveformData по времени файла через нарезку).
export default function SpeechLanePreview({ layers, audioClips, wave, currentTime, duration, lit }) {
  const tf = timelineToFileTime(audioClips, currentTime)
  const level = tf != null && wave?.length
    ? (wave[Math.min(wave.length - 1, Math.floor(tf * WAVEFORM_FPS))] ?? 0) / 255
    : 0

  return (
    <div className="tlPreview slPreview">
      <div className="tlPreviewHead">
        <span className="tlPreviewTitle">Предпросмотр</span>
        <span className="tlPreviewTime">{fmtAudioTime(currentTime)} / {fmtAudioTime(duration)}</span>
      </div>
      <div className="slPreviewPhone">
        <SpeechLaneStage layers={layers} t={currentTime} lit={lit} level={level} />
      </div>
    </div>
  )
}
