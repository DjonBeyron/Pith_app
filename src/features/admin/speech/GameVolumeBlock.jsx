import { useState } from 'react'
import { openGameMic, closeGameMic, describeGameMic } from '../../../shared/lib/gameMic.js'
import { getGameCtx, unlockGameCtx, peekGameCtx } from '../../../shared/lib/gameAudioCtx.js'
import { playGameBuffer } from '../../../shared/lib/gameBufferPlay.js'
import { nudgeVolume, testToneBuffer, readNudgeMode, writeNudgeMode } from '../../../shared/lib/gameVolumeNudge.js'
import { readLoudness, writeLoudness, LOUDNESS_MODES, LOUDNESS_LABELS } from '../../../shared/lib/audioLoudness.js'
import { readMediaKeep, writeMediaKeep } from '../../../shared/lib/gameMediaKeep.js'
import { readMicHoldMode, writeMicHoldMode, readAudioSessionMode, writeAudioSessionMode } from '../../../shared/lib/gameAudioSettings.js'
import GameVolumeLab from './GameVolumeLab.jsx'

// Админ → «Голос»: «Громкость на iPhone» (замечание владельца, v3.3.192: «игра тише, чем может телефон; помогает кнопка громкости: тише, потом громче на миг»). Хруст голоса Пита чинили
// отключением голосовой обработки микрофона — после этого стало тише, а программное усиление хруст возвращает. Значит, нужен системный уровень: «встряска» вывода, не трогая микрофон.
// Проверка на слух: 1) «Открыть микрофон игры» 2) «Тест-звук» (три тона, как звуки игры) — тихо ли 3) любая «Встряхнуть: …» и снова «Тест-звук» — стало ли громче. Что сработало — выбери
// в «Само после открытия микрофона»: встряска пойдёт сама при каждом старте игры. По умолчанию выкл: в v3.3.193 автоматический «Playback на миг» в игре дал рассинхрон рта Пита и пропадание звука. Результат каждой встряски — строка в журнале игры «[audio] встряска громкости: …».
const NUDGES = [['ctx', 'контекст'], ['session', 'сессия'], ['playback', 'playback на миг'], ['media', '<audio>'], ['all', 'всё сразу']]
const AUTO = [['off', 'Выкл'], ...NUDGES.map(([v, t]) => [v, t[0].toUpperCase() + t.slice(1)])]

export default function GameVolumeBlock() {
  const [auto, setAuto] = useState(readNudgeMode)
  const [loud, setLoud] = useState(readLoudness)
  const [keep, setKeep] = useState(readMediaKeep)
  const [hold, setHold] = useState(readMicHoldMode)
  const [sess, setSess] = useState(readAudioSessionMode)
  const [note, setNote] = useState('')
  const [mic, setMic] = useState(() => !!describeGameMic().open)
  const open = () => { unlockGameCtx(); openGameMic().then(r => { setMic(r === 'granted'); setNote(`Микрофон: ${r}`) }) } // getUserMedia и контекст — прямо в нажатии
  const close = () => { closeGameMic(); setMic(false); setNote('Микрофон закрыт') }
  const tone = () => {
    unlockGameCtx()
    const buf = testToneBuffer(getGameCtx())
    setNote(buf && playGameBuffer(buf) ? `Тест-звук играет (контекст ${peekGameCtx()?.state ?? '—'})` : 'Тест-звук не сыграл: нет Web Audio')
  }
  const nudge = async how => { setNote(`Встряхиваю: ${how}…`); const r = await nudgeVolume(how); setNote(`${how}: ${r.ok ? 'сделано' : 'не вышло'} (${r.ms} мс) — ${r.steps.join('; ')}`) }
  const pick = v => { writeNudgeMode(v); setAuto(readNudgeMode()) }
  const pickHold = v => { writeMicHoldMode(v); setHold(readMicHoldMode()); setNote('Режим микрофона сохранён — действует со следующего старта игры (выйди из игры и нажми «Начать»)') }
  const pickSess = v => { writeAudioSessionMode(v); setSess(readAudioSessionMode()); setNote('Тип сессии сохранён — действует со следующего старта игры') }
  const pickKeep = v => { writeMediaKeep(v); setKeep(readMediaKeep()); setNote(v === 'on' ? 'Включено: со следующего старта игры (тап «Начать») в фоне играет беззвучный <audio>' : 'Выключено: со следующего старта игры') }
  const pickLoud = v => { writeLoudness(v); setLoud(readLoudness()); setNote('Режим громкости сохранён — перезагружаю страницу…'); setTimeout(() => globalThis.location?.reload?.(), 500) }
  return (
    <section className="aspBlock" data-testid="game-volume-block">
      <h3 className="aspH">🔊 Стенд громкости и громкость на iPhone</h3>
      <p className="aspHint">Когда игра тише, чем может телефон, а кнопка громкости (тише → громче) это лечит: сначала проверь на слух, какая встряска помогает, потом включи её «само». Программно усиливать звук нельзя — вернётся хруст.</p>
      <h4 className="aspH">Режим звонка: микрофон во время речи Пита</h4>
      <p className="aspHint">Пока микрофон открыт, iPhone ведёт звук игры как звонок: в полоске громкости иконка трубки, и звук тише, чем вне игры (иконка динамика). Режим «Закрывать микрофон» на время речи Пита останавливает поток по-настоящему, и iPhone выходит из режима звонка, а когда Пит договорил, микрофон открывается заново. Включи его, выйди из игры, нажми «Начать» и смотри на иконку в полоске громкости, пока говорит Пит: динамик = режим звонка выключен.</p>
      <div className="aspChips" role="radiogroup" aria-label="Микрофон во время речи Пита" data-testid="vol-hold">
        {[['enabled-false', 'Выключать дорожку (как сейчас)'], ['close', 'Закрывать микрофон (громче)'], ['none', 'Не трогать']].map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={hold === v} className={`aspChip${hold === v ? ' aspChipOn' : ''}`} onClick={() => pickHold(v)} data-value={v}>{t}</button>)}
      </div>
      <div className="aspChips" role="radiogroup" aria-label="Аудиосессия iOS" data-testid="vol-session">
        {[['play-and-record', 'Сессия: запись+воспр. (как сейчас)'], ['auto', 'Сессия: авто'], ['phases', 'Сессия: по фазам']].map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={sess === v} className={`aspChip${sess === v ? ' aspChipOn' : ''}`} onClick={() => pickSess(v)} data-value={v}>{t}</button>)}
      </div>
      <h4 className="aspH">Беззвучный &lt;audio&gt; на время игры (не помог в 3.3.201)</h4>
      <p className="aspHint">На iPhone звук игры вдвое тише того же файла в Telegram. По умолчанию выключено (3.3.202): в журнале 3.3.201 элемент играл, а игра осталась тихой. Действует со следующего старта игры.</p>
      <div className="aspChips" role="radiogroup" aria-label="Громкость как у медиа" data-testid="vol-keep">
        {[['on', 'Вкл'], ['off', 'Выкл']].map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={keep === v} className={`aspChip${keep === v ? ' aspChipOn' : ''}`} onClick={() => pickKeep(v)} data-value={v}>{t}</button>)}
      </div>
      <h4 className="aspH">Громкость звуков игры</h4>
      <div className="aspChips" role="radiogroup" aria-label="Громкость звуков игры" data-testid="vol-loudness">
        {LOUDNESS_MODES.map(v => <button key={v} type="button" role="radio" aria-checked={loud === v} className={`aspChip${loud === v ? ' aspChipOn' : ''}`} onClick={() => pickLoud(v)} data-value={v}>{LOUDNESS_LABELS[v]}</button>)}
      </div>
      {note && <div className="aspCapVal" data-testid="vol-note">{note}</div>}
      <div className="aspRow">
        <button type="button" className="aspChip" onClick={mic ? close : open} data-testid="vol-mic">{mic ? 'Закрыть микрофон игры' : 'Открыть микрофон игры'}</button>
        <button type="button" className="aspChip" onClick={tone} data-testid="vol-tone">▶ Тест-звук</button>
      </div>
      <div className="aspChips" data-testid="vol-nudges">
        {NUDGES.map(([v, t]) => <button key={v} type="button" className="aspChip" onClick={() => nudge(v)} data-value={v}>Встряхнуть: {t}</button>)}
      </div>
      <GameVolumeLab />
      <h4 className="aspH">Само после открытия микрофона (по умолчанию: выкл)</h4>
      <div className="aspChips" role="radiogroup" aria-label="Встряска громкости" data-testid="vol-auto">
        {AUTO.map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={auto === v} className={`aspChip${auto === v ? ' aspChipOn' : ''}`} onClick={() => pick(v)} data-value={v}>{t}</button>)}
      </div>
    </section>
  )
}
