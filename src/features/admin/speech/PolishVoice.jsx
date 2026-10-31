import { unvoicedRows } from '../../rehearsal/polish/polishLines.js'

// Озвучка в «Шлифовке репетиции»: строка «Реплики Пита: озвучено N из M» + «Озвучить реплики (ElevenLabs)», строка про куски/слова фразы + «Озвучить куски фразы», прогресс («озвучиваю rh_start…»), текст ошибки и
// список «без озвучки» с причиной. v — результат usePolishVoice. disabled — игра идёт (озвучка в это время не нужна).
export default function PolishVoice({ v, disabled = false, plan = true }) {
  const loaded = !!v.lines
  const pitAll = loaded && v.pit.done >= v.pit.total
  const chunksAll = v.chunks.done >= v.chunks.total
  const rest = loaded ? unvoicedRows(v.lines) : []
  const working = !!v.busy
  return (
    <div className="rhpVoice" data-testid="rh-polish-voice">
      <div className="rhpVoiceRow">
        <span data-testid="rh-polish-pit">Реплики Пита: {loaded ? `озвучено ${v.pit.done} из ${v.pit.total}` : 'загружаю…'}</span>
        <button type="button" className="aspChip" onClick={v.voicePit} disabled={disabled || working || !loaded || pitAll} data-testid="rh-polish-voice-pit">
          {v.busy === 'lines' ? 'Озвучиваю…' : pitAll ? 'Реплики озвучены' : 'Озвучить реплики (ElevenLabs)'}
        </button>
      </div>
      <div className="rhpVoiceRow">
        <span data-testid="rh-polish-chunks">Куски и слова фразы: озвучено {v.chunks.done} из {v.chunks.total}</span>
        <button type="button" className="aspChip" onClick={v.voiceChunks} disabled={disabled || working || !plan || chunksAll} data-testid="rh-polish-voice-chunks">
          {v.busy === 'chunks' ? 'Озвучиваю…' : chunksAll ? 'Куски озвучены' : 'Озвучить куски фразы'}
        </button>
      </div>
      {working && v.step && <div className="aspHint" role="status" data-testid="rh-polish-voice-step">озвучиваю {v.step}…</div>}
      {v.error && <p className="aspErr" role="alert" data-testid="rh-polish-voice-error">Реплики не озвучились: {v.error}. Нужны права админа и доступ к ElevenLabs; что успело озвучиться, сохранено.</p>}
      {Object.entries(v.chunkErrors).map(([key, msg]) => <p key={key} className="aspErr" role="alert">«{key}»: {msg}</p>)}
      {rest.length > 0 && (
        <details className="rhpUnvoiced" data-testid="rh-polish-unvoiced">
          <summary>Без озвучки: {rest.length}</summary>
          <ul className="aspHint">
            {rest.map(r => <li key={r.id} data-testid={`rh-polish-unvoiced-${r.id}`}><code>{r.id}</code> — {r.why}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
