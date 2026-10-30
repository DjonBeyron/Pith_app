import { useState } from 'react'
import { isMicProcessingOn, setMicProcessingOn } from '../../../../shared/lib/gameMic.js'
import { readAudioSessionMode, readMicHoldMode, writeMicHoldMode } from '../../../../shared/lib/gameAudioSettings.js'
import { getRewardSound, setRewardSound, getRewardVolume, setRewardVolume, REWARD_SOUNDS } from './wordLaneMeow.js'
import { unlockNotes } from './wordLaneNotes.js'
import { readPillSafe, writePillSafe, applyPillSafe, readTapMode, writeTapMode, applyAudioSessionMode } from './wordLaneHudSettings.js'

// Быстрые переключатели режимов в окне комментария (WordLaneComment): те же настройки и те же функции, что в HUD (WordLaneHud.jsx, wordLaneHudSettings.js) — «почему хрипит звук»: тип аудиосессии, дорожка микрофона на речь Пита,
// обработка микрофона, звук и громкость награды, безопасные слои пилюль, тап вместо речи. Игра на паузе: тип сессии и дорожка читаются заново при «Продолжить» (startGameAudio открывает микрофон и сессию снова),
// поэтому все пункты вступают в силу после «Продолжить». Каждое переключение уходит в onChange({ key, label, from, to }) — комментарий хранит, что менялось. Стили — как у HUD (word-lane-hud.css).
const SESSION_OPTS = [['play-and-record', 'Запись+воспр.'], ['auto', 'Авто'], ['phases', 'По фазам']]
const HOLD_OPTS = [['none', 'Не глушить'], ['enabled-false', 'Глушить дорожку'], ['close', 'Закрывать микрофон']]
const rewardLabel = v => ({ meow: 'Мяу', custom: 'Свой звук', off: 'Без звука' })[v] ?? 'Ноты' // остальное из REWARD_SOUNDS — прежние ноты
const yn = v => (v ? 'вкл' : 'выкл')

function Row({ label, testid, children }) {
  return <div className="wlHudRow" data-testid={testid}><div className="wlHudLabel">{label}</div><div className="wlHudChips">{children}</div></div>
}
function Chip({ on, onClick, children, testid }) {
  return <button type="button" className={`wlHudChip${on ? ' wlHudChip--on' : ''}`} aria-pressed={!!on} onClick={onClick} data-no-unlock="" data-testid={testid}>{children}</button>
}

export default function WordLaneCommentQuick({ rootRef, setTapMode = null, onChange = null }) {
  const [, setTick] = useState(0)
  const session = readAudioSessionMode(), hold = readMicHoldMode(), proc = isMicProcessingOn(), reward = getRewardSound(), volume = getRewardVolume(), safe = readPillSafe(), tap = readTapMode()
  const change = (key, label, from, to, apply) => () => { apply(); onChange?.({ key, label, from, to }); setTick(n => n + 1) }
  const flipSafe = () => { writePillSafe(!safe); applyPillSafe(rootRef?.current, !safe); onChange?.({ key: 'safe', label: 'безопасные слои', from: yn(safe), to: yn(!safe) }); setTick(n => n + 1) } // класс — прямо на корень игры, без перерисовки пилюль
  return (
    <div className="wlCmtQuick" data-testid="wl-cmt-quick">
      <Row label="Аудиосессия iOS" testid="wl-cmt-session">
        {SESSION_OPTS.map(([v, t]) => <Chip key={v} on={session === v} onClick={change('session', 'аудиосессия', session, v, () => applyAudioSessionMode(v))} testid={`wl-cmt-session-${v}`}>{t}</Chip>)}
      </Row>
      <Row label="Дорожка микрофона на речь Пита" testid="wl-cmt-hold">
        {HOLD_OPTS.map(([v, t]) => <Chip key={v} on={hold === v} onClick={change('hold', 'дорожка на речь Пита', hold, v, () => writeMicHoldMode(v))} testid={`wl-cmt-hold-${v}`}>{t}</Chip>)}
      </Row>
      <Row label="Обработка микрофона (эхо/шум)" testid="wl-cmt-proc">
        <Chip on={proc} onClick={change('proc', 'обработка микрофона', yn(proc), yn(!proc), () => setMicProcessingOn(!proc))} testid="wl-cmt-proc-toggle">{proc ? 'Вкл (хрип!)' : 'Выкл'}</Chip>
      </Row>
      <Row label="Звук награды" testid="wl-cmt-reward">
        {REWARD_SOUNDS.map(v => <Chip key={v} on={reward === v} onClick={change('reward', 'звук награды', reward, v, () => { setRewardSound(v); if (v !== 'off') unlockNotes() })} testid={`wl-cmt-reward-${v}`}>{rewardLabel(v)}</Chip>)}
      </Row>
      <Row label={`Громкость награды: ${Math.round(volume * 100)} %`} testid="wl-cmt-volume">
        <input type="range" min="0" max="1" step="0.05" value={volume} aria-label="Громкость награды" onChange={e => { const from = Math.round(volume * 100); setRewardVolume(e.target.value); onChange?.({ key: 'volume', label: 'громкость награды', from: `${from}%`, to: `${Math.round(Number(e.target.value) * 100)}%` }); setTick(n => n + 1) }} data-testid="wl-cmt-volume-range" />
      </Row>
      <Row label="Безопасные слои пилюль (iOS)" testid="wl-cmt-safe">
        <Chip on={safe} onClick={flipSafe} testid="wl-cmt-safe-toggle">{safe ? 'Вкл' : 'Выкл'}</Chip>
      </Row>
      <Row label="Тап вместо речи" testid="wl-cmt-tap">
        <Chip on={tap} onClick={change('tap', 'тап вместо речи', yn(tap), yn(!tap), () => { writeTapMode(!tap); setTapMode?.(!tap) })} testid="wl-cmt-tap-toggle">{tap ? 'Вкл' : 'Выкл'}</Chip>
      </Row>
    </div>
  )
}
