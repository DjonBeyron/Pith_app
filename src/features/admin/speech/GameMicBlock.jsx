import { useState } from 'react'
import { isMicProcessingOn, setMicProcessingOn, describeGameMic } from '../../../shared/lib/gameMic.js'
import { readAudioSessionMode, writeAudioSessionMode, readMicHoldMode, writeMicHoldMode } from '../../../shared/lib/gameAudioSettings.js'
import { describeAudioSession } from '../../../shared/lib/gameMicSession.js'

// Админ → «Голос»: «Микрофон игры» (для «Повтори за диктором» и «Скажи вслух»). Тумблер «Обработка микрофона системой (эхо/шум)» — localStorage `pithy_mic_processing_v1`, по умолчанию ВЫКЛ.
// Выкл: поток игры открывается без эхо- и шумоподавления — голос диктора и ноты чистые. Вкл: с обработкой системы (как у «Сказать фразу») — на iPhone/Android звук страницы хрипит; включают только для сравнения
// на своём телефоне. Действует на следующее открытие потока (тап «Начать» в игре). Ниже — с какими ограничениями открыт/откроется поток и что реально дал браузер (track.getSettings).
// Два режима для проверки «хруста» и «то громче, то тише» на iPhone (Safari, iOS 16.4+): тип аудиосессии и глушение дорожки микрофона на время речи Пита и диктора. Читаются при каждой игре; пробуй 4 сочетания 2×2.
const SESSION_OPTS = [['play-and-record', 'Запись и воспроизведение'], ['auto', 'Авто (не трогать)'], ['phases', 'Переключать по фазам']]
const HOLD_OPTS = [['enabled-false', 'Выключать дорожку (по умолчанию)'], ['none', 'Не трогать'], ['close', 'Закрывать микрофон']]
const yn = v => (v === true ? 'да' : v === false ? 'нет' : '—')

function Chips({ label, value, options, onPick, testid }) {
  return (
    <div className="aspChips" role="radiogroup" aria-label={label} data-testid={testid}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`aspChip${value === v ? ' aspChipOn' : ''}`} onClick={() => onPick(v)} data-value={v}>{text}</button>
      ))}
    </div>
  )
}

export default function GameMicBlock() {
  const [on, setOn] = useState(isMicProcessingOn)
  const [info, setInfo] = useState(describeGameMic)
  const [sessionMode, setSessionMode] = useState(readAudioSessionMode)
  const [holdMode, setHoldMode] = useState(readMicHoldMode)
  const pickSession = v => { writeAudioSessionMode(v); setSessionMode(readAudioSessionMode()); setInfo(describeGameMic()) }
  const pickHold = v => { writeMicHoldMode(v); setHoldMode(readMicHoldMode()); setInfo(describeGameMic()) }
  const sess = describeAudioSession()
  const toggle = () => { const next = !on; setMicProcessingOn(next); setOn(next); setInfo(describeGameMic()) }
  const { constraints: c, settings: s, platform, open } = info
  return (
    <section className="aspBlock" data-testid="game-mic-block">
      <h3 className="aspH">Микрофон игры «Повтори за диктором»</h3>
      <div className="aspRow">
        <button type="button" className={`aspChip${on ? ' aspChipOn' : ''}`} onClick={toggle} aria-pressed={on} data-testid="mic-processing-toggle">
          Обработка микрофона системой (эхо/шум): {on ? 'вкл' : 'выкл'}
        </button>
      </div>
      <p className="aspHint">По умолчанию выкл: микрофон игры открывается без эхо- и шумоподавления, и голос Пита с нотами звучит чисто. Включи, чтобы сравнить на своём телефоне: если с обработкой слышен хрип, а без неё нет — причина в ней. Действует со следующего тапа «Начать» в игре (перезапусти игру или урок).</p>
      <h4 className="aspH">Аудиосессия iOS</h4>
      <Chips label="Аудиосессия iOS" value={sessionMode} options={SESSION_OPTS} onPick={pickSession} testid="audio-session-mode" />
      <p className="aspHint">«Запись и воспроизведение» (по умолчанию): тип ставится в тапе «Начать» и держится до конца игры — iOS не пересчитывает режим на каждом звуке. «Авто»: ничего не трогаем, как раньше. «По фазам»: на время речи Пита и диктора — playback, на очередь ученика — запись и воспроизведение (экспериментально: может заглушить микрофон). Что проверить: хруст в голосе Пита и скачки громкости; в «Скачать отладку» события audio-session.</p>
      <div className="aspCapVal" data-testid="audio-session-info">{sess.supported ? `navigator.audioSession.type сейчас: ${sess.type ?? '—'}` : 'navigator.audioSession: нет API (нужен Safari 16.4+) — режим ничего не меняет'}</div>
      <h4 className="aspH">Микрофон во время речи Пита</h4>
      <Chips label="Микрофон во время речи Пита" value={holdMode} options={HOLD_OPTS} onPick={pickHold} testid="mic-hold-mode" />
      <p className="aspHint">«Выключать дорожку» (по умолчанию с 3.3.76; на журналах iPhone с «Не трогать» голос Пита попадал в распознавание, и пилюли защёлкивались во время его речи): пока говорит Пит или диктор, track.enabled = false — динамик не попадает в микрофон и iOS не приглушает звук под захват; потом дорожка возвращается и проверяется (muted / readyState — в отладке mic-hold). Если после возврата дорожка не ожила, игра переоткрывает микрофон. Что проверить: пропал ли хруст и «то громче, то тише»; слышит ли игра ученика после реплик Пита. В этом режиме запись отладки во время речи тихая — это ожидаемо.</p>
      <p className="aspHint" data-testid="mic-hold-close-hint">«Закрывать микрофон» («только в фазе ученика», как в «Сказать фразу»): пока говорит диктор или Пит, поток микрофона закрывается совсем (индикатор гаснет, аудиосессия не держит запись), к очереди ученика открывается заново. iPhone может спросить доступ ещё раз; если открыть не вышло, слушатель откроет микрофон сам (с эхо- и шумоподавлением). Что произошло — в отладке mic-hold.</p>
      <div className="aspCapVal" data-testid="game-mic-info">Платформа: {platform}. Поток игры: {open ? 'открыт' : info.parked ? 'закрыт на время речи (режим «Закрывать микрофон»)' : 'не открыт (откроется по тапу «Начать»)'}.</div>
      <div className="aspCapVal">Просим: эхо {yn(c.echoCancellation)}, шумодав {yn(c.noiseSuppression)}, автоусиление {yn(c.autoGainControl)}, каналов {c.channelCount}</div>
      <div className="aspCapVal">{s ? `Дал браузер: эхо ${yn(s.echoCancellation)}, шумодав ${yn(s.noiseSuppression)}, автоусиление ${yn(s.autoGainControl)}, частота ${s.sampleRate ?? '—'}` : 'Дал браузер: поток не открыт'}</div>
      <div className="aspCapVal" data-testid="game-mic-tracks">Дорожки: {info.tracks?.length ? info.tracks.map(t => `enabled=${yn(t.enabled)} muted=${yn(t.muted)} ${t.readyState}`).join('; ') : '—'}</div>
      <div className="aspRow"><button type="button" className="aspChip" onClick={() => setInfo(describeGameMic())}>Обновить</button></div>
    </section>
  )
}
