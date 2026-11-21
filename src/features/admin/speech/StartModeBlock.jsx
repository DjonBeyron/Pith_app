import { useState } from 'react'
import { readStartMode, writeStartMode, readAudioSessionMode, writeAudioSessionMode, DEFAULT_AUDIO_SESSION_MODE } from '../../../shared/lib/gameAudioSettings.js'
import { describeAudioSession } from '../../../shared/lib/gameMicSession.js'

// Админ → «Голос», первый блок: «Режим запуска звука на iPhone» (v3.3.334–335). Владелец: при старте игры на iPhone всплывает системный ползунок громкости и сам идёт вверх — игра не должна трогать громкость.
// Ползунок двигает смена режима звука iOS на старте (запись → микрофон → playback), а не усиление игры. Пять режимов запуска для проверки на телефоне: настройка pithy_game_start_mode_v1 (gameAudioSettings.js),
// читается на каждом старте игры. Режимы действуют только при типе аудиосессии игры «Playback весь сеанс» (умолчание) — если выбран другой, блок это показывает и даёт кнопку вернуть.
const OPTS = [
  ['default', 'А · как сейчас', 'запись → микрофон → playback (две смены режима звука). Умолчание.'],
  ['direct', 'Б · сразу playback', 'playback ставится сразу в тапе, «запись» не ставится вовсе. Риск: iPhone может не дать микрофон — слова не будут слышны.'],
  ['late', 'В · playback после микрофона', 'до микрофона ничего не трогаем, playback — после его ответа.'],
  ['wait', 'Г · А + реплика ждёт микрофон', 'как А, но первая реплика «Гонки» ждёт микрофон (до 2,5 с) — звук не начинается в «режиме звонка».'],
  ['direct-wait', 'Д · Б + реплика ждёт микрофон', 'как Б, и первая реплика ждёт микрофон.'],
]

export default function StartModeBlock() {
  const [mode, setMode] = useState(readStartMode)
  const [session, setSession] = useState(readAudioSessionMode)
  const pick = v => { writeStartMode(v); setMode(readStartMode()) }
  const fixSession = () => { writeAudioSessionMode(DEFAULT_AUDIO_SESSION_MODE); setSession(readAudioSessionMode()) }
  const sess = describeAudioSession(), works = session === DEFAULT_AUDIO_SESSION_MODE
  return (
    <section className="aspBlock" data-testid="start-mode-block">
      <h3 className="aspH">🔈 Режим запуска звука на iPhone (ползунок громкости при старте)</h3>
      <p className="aspHint">При старте игры на iPhone всплывает системный ползунок громкости и сам идёт вверх. Выбери режим, полностью выйди из игры, запусти её и смотри на ползунок. Перезагрузка не нужна. В каждом режиме проверь: ползунок, слышит ли игра голос, нет ли хрипа.</p>
      <div className="aspChips" role="radiogroup" aria-label="Режим запуска звука" data-testid="audio-start-mode">
        {OPTS.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} className={`aspChip${mode === v ? ' aspChipOn' : ''}`} onClick={() => pick(v)} data-value={v}>{text}</button>
        ))}
      </div>
      <div className="aspCapVal" data-testid="audio-start-now">Выбрано: {OPTS.find(o => o[0] === mode)?.[1]} — {OPTS.find(o => o[0] === mode)?.[2]}</div>
      {!works && (
        <div className="aspRow" data-testid="audio-start-warn">
          <span className="aspCapVal">⚠ Режимы не действуют: в «Старое» → «Микрофон игры» выбран тип аудиосессии «{session}», а нужен «Playback весь сеанс».</span>
          <button type="button" className="aspChip" onClick={fixSession}>Вернуть Playback</button>
        </div>
      )}
      <div className="aspCapVal">{sess.supported ? `Тип звука iPhone сейчас: ${sess.type ?? '—'}` : 'На этом устройстве нет navigator.audioSession (нужен Safari 16.4+) — режимы ничего не меняют'}</div>
      <p className="aspHint">В журнале игры после старта: «[audio] режим запуска звука: …». Пришли лог после каждого режима.</p>
    </section>
  )
}
