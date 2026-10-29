import { useState } from 'react'
import { isMicProcessingOn, setMicProcessingOn, describeGameMic } from '../../../shared/lib/gameMic.js'

// Админ → «Голос»: «Микрофон игры» (для «Повтори за диктором» и «Скажи вслух»). Тумблер «Обработка микрофона системой (эхо/шум)» — localStorage `pithy_mic_processing_v1`, по умолчанию ВЫКЛ.
// Выкл: поток игры открывается без эхо- и шумоподавления — голос диктора и ноты чистые. Вкл: с обработкой системы (как у «Сказать фразу») — на iPhone/Android звук страницы хрипит; включают только для сравнения
// на своём телефоне. Действует на следующее открытие потока (тап «Начать» в игре). Ниже — с какими ограничениями открыт/откроется поток и что реально дал браузер (track.getSettings).
const yn = v => (v === true ? 'да' : v === false ? 'нет' : '—')

export default function GameMicBlock() {
  const [on, setOn] = useState(isMicProcessingOn)
  const [info, setInfo] = useState(describeGameMic)
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
      <div className="aspCapVal" data-testid="game-mic-info">Платформа: {platform}. Поток игры: {open ? 'открыт' : 'не открыт (откроется по тапу «Начать»)'}.</div>
      <div className="aspCapVal">Просим: эхо {yn(c.echoCancellation)}, шумодав {yn(c.noiseSuppression)}, автоусиление {yn(c.autoGainControl)}, каналов {c.channelCount}</div>
      <div className="aspCapVal">{s ? `Дал браузер: эхо ${yn(s.echoCancellation)}, шумодав ${yn(s.noiseSuppression)}, автоусиление ${yn(s.autoGainControl)}, частота ${s.sampleRate ?? '—'}` : 'Дал браузер: поток не открыт'}</div>
      <div className="aspRow"><button type="button" className="aspChip" onClick={() => setInfo(describeGameMic())}>Обновить</button></div>
    </section>
  )
}
