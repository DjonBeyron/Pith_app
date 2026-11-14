import { useState } from 'react'
import PolishSettings from './PolishSettings.jsx'
import MiaVoicePicker from './MiaVoicePicker.jsx'
import RaceVoiceRow from './RaceVoiceRow.jsx'
import { getElevenLabsQuota } from '../../../shared/lib/ttsApi.js'
import { voiceCount, missingRows } from './raceVoiceTable.js'

// Админ → «Голос» → «Встряхни память» → «Озвучка Мии» (рядом с «Озвучкой Пита», сворачивается так же): реплики эпизода «Мия» (коробка, ускорение дорожки; mia/miaLines.js) — строки Мии (голос второго
// аккаунта ElevenLabs) и Пита внутри эпизода (обычный голос), свой счёт «озвучено N из M», «Озвучить Мию», остаток символов аккаунта Мии и выбор её голоса. Данные и действия — общие с таблицей Пита
// (useRaceVoiceTable): t — результат хука, off — кнопки заблокированы (идёт озвучка / игра), onSave / onVoice — как у строк Пита.
export default function RaceMiaVoice({ rows, t, off, open, onToggle, deps }) {
  const missing = missingRows(rows), count = voiceCount(rows)
  const [quota, setQuota] = useState('') // остаток символов второго аккаунта ElevenLabs (голос Мии)
  const checkQuota = () => { setQuota('смотрю…'); (deps?.quota ?? getElevenLabsQuota)('mia').then(q => setQuota(`осталось ${(q.limit - q.used).toLocaleString('ru-RU')} из ${q.limit.toLocaleString('ru-RU')} символов`), e => setQuota(`не получилось: ${e?.message ?? e}`)) }
  const row = r => <RaceVoiceRow key={`${r.id}|${r.text}`} row={r} locked={off} error={t.errors[r.id]} onSave={t.save} onVoice={x => t.voice([x])} />
  return (
    <PolishSettings title="Озвучка Мии" open={open} onToggle={onToggle} summary={t.loaded ? `озвучено ${count.done} из ${count.total}` : 'загружаю…'} testid="mia-voice">
      <div className="rvTop" data-testid="rv-mia-top">
        <span data-testid="rv-mia-count">Озвучено {count.done} из {count.total}</span>
        <button type="button" className="aspChip" disabled={off || !missing.length} onClick={() => t.voice(missing)} data-testid="rv-voice-mia">Озвучить Мию{missing.length ? ` (${missing.length})` : ''}</button>
        <button type="button" className="aspChip" onClick={checkQuota} data-testid="rv-mia-quota-btn">Остаток аккаунта Мии</button>
        {quota && <span className="rhpHint" data-testid="rv-mia-quota">{quota}</span>}
      </div>
      <MiaVoicePicker deps={deps?.voicePicker} />
      <p className="rhpHint">Реплики Мии идут голосом второго аккаунта ElevenLabs, реплики Пита в эпизоде — обычным голосом. Прослушать — кнопка ▶.</p>
      <ul className="rvList" data-testid="rv-mia">{rows.map(row)}</ul>
    </PolishSettings>
  )
}
