import { Play, Square, Mic, RefreshCw, Trash2 } from 'lucide-react'
import { audioPartOf, AUDIO_SETS } from '../../../scene/v2/sceneVoice.js'
import { fmtDuration } from './voiceGenerate.js'
import { voiceName } from './voicePresets.js'
import { STATE_LABEL, lineVoiceStatus, lineKey } from './voiceStatus.js'
import { SET_LABEL } from './voicePlan.js'
import ScTip from '../ScTip.jsx'
import SoundCheck from './SoundCheck.jsx'

// Строка озвучки одного НАБОРА реплики (set: 'original' — текст, 'translation' — перевод): бейдж
// статуса (нет файла / озвучено + длительность · голос / устарело / озвучиваю… / ошибка / нет
// перевода — voiceStatus.js) и кнопки «Озвучить» / «Прослушать» / «Переозвучить» / «Удалить
// озвучку». У реплики без translation блок перевода неактивен с пояснением. voice — API
// useSceneVoice; без него (статичный рендер) — только бейдж. id f-timeline-<i>-audioUrl /
// -translationAudioUrl — подсветка замечаний «озвучка устарела». scene — для голоса перевода.

export default function LineVoiceControls({ index: i, line, character, voice = null, idPrefix, set = 'original', scene = null }) {
  const part = audioPartOf(line, set)
  const rt = voice?.lines?.[lineKey(i, set)]
  const status = lineVoiceStatus(line, character, rt, set, scene)
  const hasAudio = !!part.audioUrl
  const dur = fmtDuration(part.audioMeta?.durationMs)
  const lock = !!voice?.busy
  const canVoice = !!voice && !lock && !!String(part.text ?? '').trim()
  const isPlaying = voice?.playing === lineKey(i, set)
  const opts = { set }

  return (
    <div className={`scbVoiceRow scbVoiceRow-${status}`} id={`${idPrefix}-${AUDIO_SETS[set].url}`} data-set={set}>
      <span className="scbVoiceInfo">
        <span className="scbVoiceSet">{SET_LABEL[set]}:</span> <span className={`scbVoiceTag scbVoiceTag-${status}`}>{STATE_LABEL[status]}{status === 'ready' && dur ? ` · ${dur}` : ''}</span>
        {hasAudio && status !== 'error' && part.audioMeta?.voiceId && <span className="scbSub"> · {voiceName(part.audioMeta.voiceId)}</span>}
        {status === 'error' && <span className="scbVoiceErr" role="alert"> {rt.error}</span>}
        {status === 'stale' && <span className="scbSub"> — {set === 'translation' ? 'перевод или голос перевода изменились (или перевод убрали)' : 'текст или голос изменились после озвучки'}</span>}
        {status === 'empty' && <span className="scbSub"> — впишите перевод, чтобы озвучить его отдельным голосом</span>}
        {status === 'tpl' && <span className="scbSub"> — слово подставляется, готового файла перевода нет</span>}
        {status === 'none' && !hasAudio && set === 'original' && <ScTip help="audio_status" />}
        {(status === 'none' || status === 'empty') && !hasAudio && set === 'translation' && <ScTip help="voice_translation" />}
      </span>
      {voice && status !== 'empty' && status !== 'tpl' && (
        <span className="scbVoiceBtns">
          {hasAudio && (
            <button type="button" className="scbIcon" onClick={() => voice.playLine(i, set)} aria-label={isPlaying ? 'Остановить' : 'Прослушать'} title={isPlaying ? 'Остановить' : 'Прослушать'}>
              {isPlaying ? <Square size={14} /> : <Play size={14} />}
            </button>
          )}
          {!hasAudio && (
            <button type="button" className="fsBtn fsBtnSmall" onClick={() => voice.voiceLine(i, opts)} disabled={!canVoice} title={`Сгенерировать озвучку (${SET_LABEL[set].toLowerCase()}) через ElevenLabs`}>
              <Mic size={13} /> {status === 'error' ? 'Повторить' : 'Озвучить'}
            </button>
          )}
          {hasAudio && (
            <button type="button" className={status === 'stale' ? 'fsBtn fsBtnSmall fsBtnPrimary' : 'fsBtn fsBtnSmall'} onClick={() => voice.voiceLine(i, { ...opts, force: true })} disabled={!canVoice} title="Сгенерировать заново (старый файл удалится)">
              <RefreshCw size={13} /> Переозвучить
            </button>
          )}
          {hasAudio && (
            <button type="button" className="scbIcon scbIconDanger" onClick={() => voice.removeLineAudio(i, set)} disabled={lock} aria-label="Удалить озвучку" title="Удалить файл и очистить поля озвучки">
              <Trash2 size={14} />
            </button>
          )}
          {hasAudio && <SoundCheck url={part.audioUrl} tip={false} />}
        </span>
      )}
    </div>
  )
}
