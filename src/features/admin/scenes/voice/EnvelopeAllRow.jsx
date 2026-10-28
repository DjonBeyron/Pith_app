import { AudioWaveform } from 'lucide-react'
import { envelopeTargets } from './voiceEnvelope.js'

// Строка «Посчитать огибающую» для всех реплик сцены (часть панели озвучки в таймлайне): огибающая громкости (audioMeta.env) нужна рту
// «живого Пита v2»; у новой озвучки она считается сразу, здесь — догнать старую. Реплики без audioMeta.hash пропускаются (в итоге
// сказано сколько). Прогон по одной реплике, ошибка одной не останавливает остальные (useEnvelopeActions). voice — API useSceneVoice.

export default function EnvelopeAllRow({ scene, voice }) {
  const { todo, skipped } = envelopeTargets(scene)
  const st = voice.envAllState
  const running = !!st && st.done < st.total
  if (!todo.length && !skipped && !st) return null
  return (
    <div className="scbVoiceHead" id="f-timeline-envelope">
      <span className="scbVoiceStat scbSub">
        Огибающая громкости (рот «живого Пита v2»): {todo.length ? <>нет у <b>{todo.length}</b></> : 'у всех озвученных есть'}
        {skipped > 0 && <span title="Файл без audioMeta.hash: переозвучьте реплику, тогда огибающая посчитается сама"> · пропущено без hash: {skipped}</span>}
        {running && <> · считаю {st.done + 1} из {st.total}…</>}
        {st && !running && st.total > 0 && <> · готово {st.total - st.failed} из {st.total}{st.failed ? <span className="scWarnTxt">, с ошибкой {st.failed} (причина — у реплики)</span> : ''}</>}
      </span>
      {todo.length > 0 && (
        <button type="button" className="scbLink" onClick={() => voice.envAll()} disabled={voice.busy} title="Скачать озвученные файлы и посчитать огибающую у каждой реплики, где её нет">
          <AudioWaveform size={13} /> Посчитать огибающую
        </button>
      )}
    </div>
  )
}
