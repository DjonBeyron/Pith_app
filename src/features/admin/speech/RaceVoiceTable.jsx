import { useState } from 'react'
import PolishSettings from './PolishSettings.jsx'
import MiaVoicePicker from './MiaVoicePicker.jsx'
import { getElevenLabsQuota } from '../../../shared/lib/ttsApi.js'
import RaceVoiceRow from './RaceVoiceRow.jsx'
import useRaceVoiceTable from './useRaceVoiceTable.js'
import { voiceCount, missingRows, voiceable } from './raceVoiceTable.js'

// Админ → «Голос» → «Встряхни память» → «Озвучка Пита»: фразы плана целиком (английская фраза одной записью, game2_phrases), все реплики игры (каталог raceLines.js), смыслы и ситуации фраз текущего плана и (свёрнуто) переводы слов — текст, статус озвучки, переозвучка.
// Сворачивается (open / onToggle ведёт блок через usePolishOpen, по умолчанию свёрнуто). Сверху — «озвучено N из M», «Озвучить недостающие» и «Переозвучить все» (оба тратят ElevenLabs, второе — с подтверждением).
// Сохранённый здесь текст реплики главнее каталога кода: игра говорит и показывает его (raceLineText.js), до переозвучки статус «текст изменён после озвучки».
export default function RaceVoiceTable({ plan, locked = false, open, onToggle, onChange, confirm = q => globalThis.confirm?.(q) ?? false, deps }) {
  const t = useRaceVoiceTable({ plan, onChange, deps })
  const { whole, lines, mia, meanings, scenes, trans } = t.groups
  const all = [...whole, ...lines, ...meanings, ...scenes, ...trans] // эпизод «Мия» — отдельная группа со своим счётом и кнопкой (другой аккаунт ElevenLabs)
  const miaMissing = missingRows(mia), miaCount = voiceCount(mia)
  const [quota, setQuota] = useState('') // остаток символов второго аккаунта ElevenLabs (голос Мии)
  const checkQuota = () => { setQuota('смотрю…'); (deps?.quota ?? getElevenLabsQuota)('mia').then(q => setQuota(`осталось ${(q.limit - q.used).toLocaleString('ru-RU')} из ${q.limit.toLocaleString('ru-RU')} символов`), e => setQuota(`не получилось: ${e?.message ?? e}`)) }
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
      {whole.length > 0 && <><h4 className="rvGroup">Фразы целиком</h4><ul className="rvList" data-testid="rv-whole">{whole.map(row)}</ul></>}
      <h4 className="rvGroup">Реплики игры</h4>
      <ul className="rvList" data-testid="rv-lines">{lines.map(row)}</ul>
      <h4 className="rvGroup">Эпизод «Мия» (коробка, ускорение дорожки)</h4>
      <div className="rvTop" data-testid="rv-mia-top">
        <span data-testid="rv-mia-count">Озвучено {miaCount.done} из {miaCount.total}</span>
        <button type="button" className="aspChip" disabled={off || !miaMissing.length} onClick={() => t.voice(miaMissing)} data-testid="rv-voice-mia">Озвучить Мию{miaMissing.length ? ` (${miaMissing.length})` : ''}</button>
        <button type="button" className="aspChip" onClick={checkQuota} data-testid="rv-mia-quota-btn">Остаток аккаунта Мии</button>
        {quota && <span className="rhpHint" data-testid="rv-mia-quota">{quota}</span>}
      </div>
      <MiaVoicePicker deps={deps?.voicePicker} />
      <p className="rhpHint">Реплики Мии идут голосом второго аккаунта ElevenLabs, реплики Пита — обычным голосом. Прослушать — кнопка ▶.</p>
      <ul className="rvList" data-testid="rv-mia">{mia.map(row)}</ul>
      {meanings.length > 0 && <><h4 className="rvGroup">Смыслы фраз плана</h4><ul className="rvList" data-testid="rv-meanings">{meanings.map(row)}</ul></>}
      {scenes.length > 0 && <><h4 className="rvGroup">Ситуации (круг 1)</h4><ul className="rvList" data-testid="rv-scenes">{scenes.map(row)}</ul></>}
      {trans.length > 0 && (
        <details className="rvSub" data-testid="rv-trans">
          <summary>Переводы слов · озвучено {transCount.done} из {transCount.total}</summary>
          <ul className="rvList">{trans.map(row)}</ul>
        </details>
      )}
    </PolishSettings>
  )
}
