import PolishSettings from './PolishSettings.jsx'
import RaceVoiceRow from './RaceVoiceRow.jsx'
import useRaceVoiceTable from './useRaceVoiceTable.js'
import { voiceCount, missingRows, voiceable } from './raceVoiceTable.js'

// Админ → «Голос» → «Встряхни память» → «Озвучка Пита»: все реплики игры (каталог raceLines.js), смыслы фраз текущего плана и (свёрнуто) переводы слов — текст, статус озвучки, переозвучка.
// Сворачивается (open / onToggle ведёт блок через usePolishOpen, по умолчанию свёрнуто). Сверху — «озвучено N из M», «Озвучить недостающие» и «Переозвучить все» (оба тратят ElevenLabs, второе — с подтверждением).
// Сохранённый здесь текст реплики главнее каталога кода: игра говорит и показывает его (raceLineText.js), до переозвучки статус «текст изменён после озвучки».
export default function RaceVoiceTable({ plan, locked = false, open, onToggle, onChange, confirm = q => globalThis.confirm?.(q) ?? false, deps }) {
  const t = useRaceVoiceTable({ plan, onChange, deps })
  const { lines, meanings, trans } = t.groups
  const all = [...lines, ...meanings, ...trans]
  const count = voiceCount(all)
  const missing = missingRows(all)
  const off = locked || t.busy || !t.loaded
  const voiceAll = () => { if (confirm(`Переозвучить все ${count.total} (тратит символы ElevenLabs)?`)) t.voice(all.filter(voiceable)) }
  const row = r => <RaceVoiceRow key={`${r.id}|${r.text}`} row={r} locked={off} error={t.errors[r.id]} onSave={t.save} onVoice={x => t.voice([x])} />
  const transCount = voiceCount(trans)
  return (
    <PolishSettings title="Озвучка Пита" open={open} onToggle={onToggle} summary={t.loaded ? `озвучено ${count.done} из ${count.total}` : 'загружаю…'} testid="race-voice">
      <div className="rvTop">
        <span data-testid="rv-count">Озвучено {count.done} из {count.total}</span>
        <button type="button" className="aspChip" disabled={off || !missing.length} onClick={() => t.voice(missing)} data-testid="rv-voice-missing">Озвучить недостающие{missing.length ? ` (${missing.length})` : ''}</button>
        <button type="button" className="aspChip" disabled={off || !count.total} onClick={voiceAll} data-testid="rv-voice-all">Переозвучить все</button>
      </div>
      {t.busy && <p className="rhpHint" role="status" data-testid="rv-step">{t.step ? `озвучиваю ${t.step}…` : 'работаю…'}</p>}
      {t.errors._all && <p className="aspErr" role="alert">Не озвучилось: {t.errors._all}</p>}
      {Object.keys(t.errors).length > 0 && <p className="rhpHint">Ошибки — в строках. Нужны права админа и доступ к ElevenLabs.</p>}
      <h4 className="rvGroup">Реплики игры</h4>
      <ul className="rvList" data-testid="rv-lines">{lines.map(row)}</ul>
      {meanings.length > 0 && <><h4 className="rvGroup">Смыслы фраз плана</h4><ul className="rvList" data-testid="rv-meanings">{meanings.map(row)}</ul></>}
      {trans.length > 0 && (
        <details className="rvSub" data-testid="rv-trans">
          <summary>Переводы слов · озвучено {transCount.done} из {transCount.total}</summary>
          <ul className="rvList">{trans.map(row)}</ul>
        </details>
      )}
    </PolishSettings>
  )
}
