import PolishSettings from './PolishSettings.jsx'
import RaceMiaVoice from './RaceMiaVoice.jsx'
import RaceVoiceRow from './RaceVoiceRow.jsx'
import VoiceAuditPanel from './VoiceAuditPanel.jsx'
import VoiceTonePanel from './VoiceTonePanel.jsx'
import useRaceVoiceTable from './useRaceVoiceTable.js'
import { voiceCount, missingRows, voiceable, unvoicedFirst, missingNote } from './raceVoiceTable.js'

// Админ → «Голос» → «Встряхни память» → «Озвучка Пита»: фразы плана целиком (английская фраза одной записью, game2_phrases), все реплики игры (каталог raceLines.js), смыслы и ситуации фраз текущего плана и (свёрнуто) переводы слов — текст, статус озвучки, переозвучка.
// Реплики Мии (mia_*, boss_mia_*) — отдельный сворачиваемый блок рядом, «Озвучка Мии» (RaceMiaVoice.jsx, miaOpen / onMiaToggle), на тех же данных; реплики Пита в эпизоде и финале (pit_*, boss_pit_*) — здесь, его голосом (v3.3.240). Сворачивается (open / onToggle ведёт блок через usePolishOpen, по умолчанию свёрнуто). Сверху — «озвучено N из M», «Озвучить недостающие» и «Переозвучить все» (оба тратят ElevenLabs, второе — с подтверждением).
// Сохранённый здесь текст реплики главнее каталога кода: игра говорит и показывает его (raceLineText.js), до переозвучки статус «текст изменён после озвучки».
export default function RaceVoiceTable({ plan, locked = false, open, onToggle, miaOpen = false, onMiaToggle = () => {}, onChange, confirm = q => globalThis.confirm?.(q) ?? false, deps }) {
  const t = useRaceVoiceTable({ plan, onChange, deps })
  const { whole, lines, mia, pitMia, meanings, scenes, trans } = t.groups
  const all = [...whole, ...lines, ...pitMia, ...meanings, ...scenes, ...trans] // эпизод «Мия» — отдельная группа со своим счётом и кнопкой (другой аккаунт ElevenLabs)
  const count = voiceCount(all)
  const missing = missingRows(all)
  const off = locked || t.busy || !t.loaded
  const voiceAll = () => { if (confirm(`Переозвучить все ${count.total} (тратит символы ElevenLabs)?`)) t.voice(all.filter(voiceable)) }
  const row = r => <RaceVoiceRow key={`${r.id}|${r.text}`} row={r} locked={off} error={t.errors[r.id]} onSave={t.save} onVoice={x => t.voice([x])} />
  const transCount = voiceCount(trans)
  return (
    <>
    <PolishSettings title="Озвучка Пита" open={open} onToggle={onToggle} summary={t.loaded ? `озвучено ${count.done} из ${count.total}${missing.length ? ` · НЕ озвучено ${missing.length}` : ''}` : 'загружаю…'} testid="race-voice">
      <div className="rvTop">
        <span data-testid="rv-count">Озвучено {count.done} из {count.total}</span>
        {missing.length > 0 && <span className="aspErr" role="status" data-testid="rv-missing">{missingNote(all)}</span>}
        <button type="button" className="aspChip" disabled={off || !missing.length} onClick={() => t.voice(missing)} data-testid="rv-voice-missing">Озвучить недостающие{missing.length ? ` (${missing.length})` : ''}</button>
        <button type="button" className="aspChip" disabled={off || !count.total} onClick={voiceAll} data-testid="rv-voice-all">Переозвучить все</button>
      </div>
      <VoiceAuditPanel t={t} off={off} />
      <VoiceTonePanel t={t} off={off} confirm={confirm} />
      {t.busy && <p className="rhpHint" role="status" data-testid="rv-step">{t.step ? `озвучиваю ${t.step}…` : 'работаю…'}</p>}
      {t.errors._all && <p className="aspErr" role="alert">Не озвучилось: {t.errors._all}</p>}
      {Object.keys(t.errors).length > 0 && <p className="rhpHint">Ошибки — в строках. Нужны права админа и доступ к ElevenLabs.</p>}
      {whole.length > 0 && <><h4 className="rvGroup">Фразы целиком</h4><ul className="rvList" data-testid="rv-whole">{unvoicedFirst(whole).map(row)}</ul></>}
      <h4 className="rvGroup">Реплики игры</h4>
      <ul className="rvList" data-testid="rv-lines">{unvoicedFirst(lines).map(row)}</ul>
      <h4 className="rvGroup">Реплики Пита в эпизоде «Мия» и в финале</h4>
      <ul className="rvList" data-testid="rv-pit-mia">{unvoicedFirst(pitMia).map(row)}</ul>
      {meanings.length > 0 && <><h4 className="rvGroup">Смыслы фраз плана</h4><ul className="rvList" data-testid="rv-meanings">{unvoicedFirst(meanings).map(row)}</ul></>}
      {scenes.length > 0 && <><h4 className="rvGroup">Ситуации (круг 1)</h4><ul className="rvList" data-testid="rv-scenes">{unvoicedFirst(scenes).map(row)}</ul></>}
      {trans.length > 0 && (
        <details className="rvSub" data-testid="rv-trans">
          <summary>Переводы слов · озвучено {transCount.done} из {transCount.total}</summary>
          <ul className="rvList">{trans.map(row)}</ul>
        </details>
      )}
    </PolishSettings>
    <RaceMiaVoice rows={mia} t={t} off={off} open={miaOpen} onToggle={onMiaToggle} deps={deps} />
    </>
  )
}
