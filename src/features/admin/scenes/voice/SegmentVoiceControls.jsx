import { Play, Square, Mic, RefreshCw, Trash2 } from 'lucide-react'
import { splitTemplate } from '../../../scene/v2/sceneVarsSegments.js'
import { segmentParts, segmentsStatus } from '../../../scene/v2/sceneSegmentsVoice.js'
import { fmtDuration } from './voiceGenerate.js'
import { STATE_LABEL, lineKey } from './voiceStatus.js'
import ScTip from '../ScTip.jsx'

// Озвучка реплики-шаблона ({слово} в тексте) ПО ЧАСТЯМ — вместо блока «Текст» у обычной реплики (LineVoiceControls).
// Реплика режется по плейсхолдерам на текстовые части («Can I have», «, please?»): каждую часть админ озвучивает тем же
// голосом, что и обычную реплику (ElevenLabs → R2, hash по тексту части + голос → «устарело»); слово подставится из
// библиотеки озвучки слов (word_audio), целиком реплика не озвучивается. Статус: «озвучено частей 2 из 2» / «озвучено
// 1 из 2» / «нет файлов» / «устарело». Перевод таких реплик не озвучивается — читает синтез устройства (подсказка «?»).
// voice — API useSceneVoice; без него (статичный рендер) — только статус. id f-timeline-<i>-segments — подсветка замечаний линтера.

export default function SegmentVoiceControls({ index: i, line, character, voice = null, idPrefix }) {
  const st = segmentsStatus(line, character)
  const { parts } = segmentParts(line, character)
  const rt = voice?.lines?.[lineKey(i)]
  const status = rt?.busy ? 'busy' : rt?.error ? 'error' : st.state === 'ready' ? 'ready' : st.state === 'none' || st.state === 'empty' ? 'none' : 'stale'
  const label = rt?.busy ? STATE_LABEL.busy : rt?.error ? STATE_LABEL.error
    : st.state === 'ready' ? `озвучено частей ${st.ready} из ${st.total}`
    : st.state === 'partial' ? `озвучено ${st.ready} из ${st.total}`
    : st.state === 'stale' ? 'устарело'
    : st.state === 'empty' ? 'озвучивать нечего' : `нет файлов (0 из ${st.total})`
  const lock = !!voice?.busy
  const hasAudio = st.ready + st.stale + st.leftover > 0
  const all = st.state === 'ready'
  const stateOf = new Map(parts.map(p => [p.k, p]))

  return (
    <div className={`scbVoiceRow scbVoiceRow-${status} scbSegRow`} id={`${idPrefix}-segments`} data-set="original" data-segments="1">
      <span className="scbVoiceInfo">
        <span className="scbVoiceSet">Текст по частям:</span> <span className={`scbVoiceTag scbVoiceTag-${status}`}>{label}</span>
        {status === 'error' && <span className="scbVoiceErr" role="alert"> {rt.error}</span>}
        {st.state === 'stale' && <span className="scbSub"> — {st.stale || st.leftover ? 'текст или голос изменились после озвучки' : 'есть неозвученные части'}</span>}
        <ScTip help="voice_segments" />
      </span>
      {voice && st.state !== 'empty' && (
        <span className="scbVoiceBtns">
          {!all && (
            <button type="button" className={st.state === 'stale' ? 'fsBtn fsBtnSmall fsBtnPrimary' : 'fsBtn fsBtnSmall'} onClick={() => voice.voiceSegments(i)} disabled={lock} title="Озвучить неозвученные и устаревшие части через ElevenLabs">
              <Mic size={13} /> {status === 'error' ? 'Повторить' : 'Озвучить части'}
            </button>
          )}
          {hasAudio && (
            <button type="button" className="fsBtn fsBtnSmall" onClick={() => voice.voiceSegments(i, { force: true })} disabled={lock} title="Сгенерировать все части заново (старые файлы удалятся)">
              <RefreshCw size={13} /> Переозвучить
            </button>
          )}
          {hasAudio && (
            <button type="button" className="scbIcon scbIconDanger" onClick={() => voice.removeSegmentsAudio(i)} disabled={lock} aria-label="Удалить озвучку частей" title="Удалить файлы частей и очистить segments">
              <Trash2 size={14} />
            </button>
          )}
        </span>
      )}
      <ul className="scbSegParts" aria-label="Части реплики">
        {splitTemplate(line.text).map((p, k) => {
          if (p.var !== undefined) return <li key={k} className="scbSegPart scbSegVar"><code>{`{${p.var}}`}</code> <span className="scbSub">слово из библиотеки озвучки слов</span></li>
          const info = stateOf.get(k)
          if (!info) return <li key={k} className="scbSegPart"><q>{p.text}</q> <span className="scbSub">без озвучки (одни знаки)</span></li>
          const url = info.seg?.audioUrl
          const key = `s${i}.${k}`
          const dur = fmtDuration(info.seg?.audioMeta?.durationMs)
          return (
            <li key={k} className="scbSegPart">
              <q>{p.text}</q> <span className={`scbVoiceTag scbVoiceTag-${info.state === 'ready' ? 'ready' : info.state === 'stale' ? 'stale' : 'none'}`}>{info.state === 'ready' ? `озвучено${dur ? ` · ${dur}` : ''}` : info.state === 'stale' ? 'устарело' : 'нет файла'}</span>
              {url && voice && (
                <button type="button" className="scbIcon" onClick={() => voice.playUrl(url, key)} aria-label={voice.playing === key ? 'Остановить' : `Прослушать часть «${p.text}»`}>
                  {voice.playing === key ? <Square size={13} /> : <Play size={13} />}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
