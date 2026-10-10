import { useMemo, useRef } from 'react'
import AudioWave from '../audio/AudioWave.jsx'
import { PlayTriangle, PauseIcon } from '../audio/AudioPlayIcons.jsx'
import { fmtAudioTime } from '../../../../shared/lib/audioUtils.js'
import { getSayVoice } from '../../../../shared/lib/speech/sayVoiceStore.js'
import { usePlayerMuted } from '../../playerMuted.js'
import { useSayVoicePlayer } from './useSayVoicePlayer.js'

// Содержимое пузыря-голосового ученика («Сказать фразу», режим ноды «голосовое с текстом»): кнопка play/pause, статичная волна по peaks клипа, длительность (форма и пропорции — те же классы
// и AudioWave, что у голосового учителя, AudioModule) и под ним текст распознанного. Клип берётся из реестра сессии по voiceId (sayVoiceStore.js); клипа нет — вызывающий (AnswerBubbles) сюда не заходит.
// Знак ✓/✕ ставит не пузырь (его ::after в голосовом режиме скрыт, say-voice.css), а хвост текста (.sayVoiceText--ok/--err). Кнопка ≥44 px (36 + зона ::after у .playerAudioBtn); aria-label «Прослушать свой ответ».
export default function SayVoiceReply({ voiceId, text, result }) {
  const clip = getSayVoice(voiceId)
  const waveRef = useRef(null)
  const timeRef = useRef(null)
  const muted = usePlayerMuted() // «без звука» урока: играет как обычно (время, волна), но не слышно
  const { audioRef, playing, toggle } = useSayVoicePlayer(clip?.durationMs ?? 0, waveRef, timeRef)
  const wave = useMemo(() => (clip?.peaks ?? []).map(p => Math.round(p * 255)), [clip])
  if (!clip) return text
  return (
    <>
      {/* data-voice — это речь, а не немая петля (useSoloMedia при «без звука»); data-say-voice — чтобы новая запись нашла и остановила (sayVoicePause.js) */}
      <audio ref={audioRef} src={clip.url} preload="auto" muted={muted} data-voice="" data-say-voice="" />
      <div className="playerAudioRow sayVoiceRow">
        <button type="button" className="playerAudioBtn" onClick={toggle} aria-label={playing ? 'Пауза' : 'Прослушать свой ответ'}>
          {playing ? <PauseIcon /> : <PlayTriangle />}
        </button>
        <div className="playerAudioWaveCol">
          <AudioWave ref={waveRef} waveData={wave} ready />
          <span ref={timeRef} className="playerAudioDur">{fmtAudioTime(clip.durationMs / 1000)}</span>
        </div>
      </div>
      <span className={`sayVoiceText ${result === 'wrong_final' ? 'sayVoiceText--err' : 'sayVoiceText--ok'}`}>{text}</span>
    </>
  )
}
