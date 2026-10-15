import { useRef, useState } from 'react'
import { Stethoscope } from 'lucide-react'
import { probeSceneAudio } from './audioProbe.js'
import ScTip from '../ScTip.jsx'

// Кнопка «Проверить звук» у файла озвучки (строка набора реплики и плашка предпросмотра):
// HEAD + пробный <audio> (audioProbe.js) → строки вердикта по-русски. Результат живёт пока
// url тот же; новая ссылка (переозвучили) — сбрасывается. probe подменяется в тестах.
export default function SoundCheck({ url, probe = probeSceneAudio, label = 'Проверить звук', tip = true }) {
  const [raw, setState] = useState(null) // null | { url, busy } | { url, ok, lines }
  const seq = useRef(0)
  if (!url) return null
  const state = raw?.url === url ? raw : null // новая ссылка (переозвучили) — старый вердикт не про неё
  const run = async () => {
    const my = ++seq.current
    setState({ url, busy: true })
    try {
      const r = await probe(url)
      if (my === seq.current) setState({ url, ok: r.ok, lines: r.lines })
    } catch (e) {
      if (my === seq.current) setState({ url, ok: false, lines: [`проверка не удалась: ${e?.message || e}`] })
    }
  }
  return (
    <span className="scbSoundCheck">
      <button type="button" className="fsBtn fsBtnSmall" onClick={run} disabled={!!state?.busy} title="HEAD по ссылке + пробная загрузка в <audio>: статус, Content-Type, размер, декодируется ли">
        <Stethoscope size={13} /> {state?.busy ? 'проверяю…' : label}
      </button>
      {tip && <ScTip help="sound_check" />}
      {state?.lines && (
        <span className={`scbSoundCheckOut ${state.ok ? 'scbSoundCheckOk' : 'scbSoundCheckBad'}`} role="status">
          {state.lines.map((l, i) => <span key={i}>{l}</span>)}
        </span>
      )}
    </span>
  )
}
