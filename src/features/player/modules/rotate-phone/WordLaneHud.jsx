import { useState, useEffect } from 'react'
import { Settings, X } from 'lucide-react'
import { APP_VERSION } from '../../../../shared/lib/version.js'
import { isMicProcessingOn, setMicProcessingOn, describeGameMic } from '../../../../shared/lib/gameMic.js'
import { readAudioSessionMode, readMicHoldMode, writeMicHoldMode } from '../../../../shared/lib/gameAudioSettings.js'
import { WHISKER_MODES, getWhiskerMode, setWhiskerMode } from '../../../scene/v2/whiskerWrite.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { voskRuntime } from '../../../../shared/lib/vosk/voskRuntime.js'
import { getVoiceRate, setVoiceRate, VOICE_RATES } from '../../lessonVolume.js'
import { getRewardSound, setRewardSound, getRewardVolume, setRewardVolume, REWARD_SOUNDS } from './wordLaneMeow.js'
import { unlockNotes } from './wordLaneNotes.js'
import { prepareAudio, buildDebugFile, saveDebugFile, SAVE_HOW } from './wordLaneDebugExport.js'
import {
  readPillSafe, writePillSafe, applyPillSafe, readWeakStored, writeWeakStored, applyAudioSessionMode, describeHud, readTapMode, writeTapMode,
} from './wordLaneHudSettings.js'

// Мини-HUD быстрой смены настроек в игре «Повтори за диктором» (по аналогии с «Лог и версия» в шапке урока): маленькая кнопка в правом верхнем углу, панель поверх игры. Виден только при включённом
// отладочном интерфейсе (dbg.enabled — тумблер админки, pithy_wl_debug_v1 или тест-запуск из админки). Своё состояние (открыта ли панель, значения переключателей) — здесь, а не в useWordLaneFlow;
// игра подписана на HUD только через стабильные колбэки, так что пилюли и кот при его работе не перерисовываются (WordLaneGame держит HUD в memo, а класс wl--safe ставится прямо на корень).
// Каждый пункт помечен, когда он вступает в силу: «сразу» / «после «Игра заново»» / «после перезагрузки» (wordLaneHudSettings.js). Значения читаются из хранилищ при каждой перерисовке.
const SESSION_OPTS = [['play-and-record', 'Запись+воспр.'], ['auto', 'Авто'], ['phases', 'По фазам']]
const HOLD_OPTS = [['none', 'Не глушить'], ['enabled-false', 'Глушить дорожку'], ['close', 'Закрывать микрофон']]
const REWARD_LABEL = { meow: 'Мяу', off: 'Без звука' } // остальное из REWARD_SOUNDS — прежние ноты
const WHEN = { now: 'сразу', restart: 'после «Игра заново»', reload: 'после перезагрузки' }
const REFRESH_MS = 1000

function Row({ label, when, children, testid }) {
  return (
    <div className="wlHudRow" data-testid={testid}>
      <div className="wlHudLabel">{label}<em className={`wlHudWhen wlHudWhen--${when}`}>{WHEN[when]}</em></div>
      <div className="wlHudChips">{children}</div>
    </div>
  )
}

function Chip({ on, onClick, children, testid }) {
  return <button type="button" className={`wlHudChip${on ? ' wlHudChip--on' : ''}`} aria-pressed={!!on} onClick={onClick} data-no-unlock="" data-testid={testid}>{children}</button>
}

export default function WordLaneHud({ dbg, rootRef, onRestartStage, onRestartGame, onExit, setTapMode = null, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const [, setTick] = useState(0)
  const [status, setStatus] = useState('')
  const refresh = () => setTick(n => n + 1)
  useEffect(() => {
    if (!open) return undefined
    const id = setInterval(refresh, REFRESH_MS) // тип аудиосессии, дорожка и Vosk меняются сами — показываем живыми
    return () => clearInterval(id)
  }, [open])

  if (!open) {
    return <button type="button" className="wlHudBtn" onClick={() => setOpen(true)} aria-label="Настройки отладки" data-no-unlock="" data-testid="wl-hud-open"><Settings size={18} /></button>
  }

  const info = describeHud({ mic: describeGameMic, vosk: () => voskRuntime.snapshot(), weak: isWeakDevice, whiskers: getWhiskerMode, version: APP_VERSION })
  const procOn = isMicProcessingOn(), session = readAudioSessionMode(), hold = readMicHoldMode()
  const reward = getRewardSound(), volume = getRewardVolume(), safe = readPillSafe(), rate = getVoiceRate(), lite = readWeakStored() ?? isWeakDevice(), tap = readTapMode(), whisk = getWhiskerMode()
  const act = fn => () => { fn(); refresh() }
  const close = () => setOpen(false)
  const toggleTap = () => { writeTapMode(!tap); setTapMode?.(!tap); refresh() } // игра узнаёт сразу: в очереди ученика появляются кнопки дорожек (как в «Порядке») и подсказка
  const toggleSafe = () => { writePillSafe(!safe); applyPillSafe(rootRef?.current, !safe); refresh() } // класс — прямо на корень игры, без перерисовки пилюль
  const download = async () => {
    setStatus('Готовлю файл…')
    try {
      const audio = await prepareAudio(dbg.recorder).catch(() => []) // запись, сделанная к этому моменту (рекордер не останавливаем — игра идёт дальше)
      const how = await saveDebugFile(buildDebugFile({ log: dbg, audio }))
      setStatus(`${SAVE_HOW[how] ?? SAVE_HOW.failed}${how === 'failed' || how === 'cancelled' ? '' : audio.length ? ' (с записью голоса)' : ' (записи голоса нет)'}`)
    } catch { setStatus(SAVE_HOW.failed) }
  }

  return (
    <div className="wlHud" role="dialog" aria-label="Настройки отладки" data-testid="wl-hud">
      <div className="wlHudHead"><strong>Настройки игры · v{info.version}</strong><button type="button" className="wlHudX" onClick={close} aria-label="Закрыть панель" data-testid="wl-hud-close"><X size={16} /></button></div>
      <div className="wlHudInfo" data-testid="wl-hud-info">
        <div>audioSession.type: <b>{info.audioSession}</b></div>
        <div>Дорожка микрофона: <b>{info.mic}</b></div>
        <div>Vosk: <b>{info.vosk}</b></div>
        <div>Lite (слабое устройство): <b>{info.lite}</b></div>
        <div>Усы (способ записи): <b>{info.whiskers}</b></div>
      </div>

      <Row label="Обработка микрофона (эхо/шум)" when="restart" testid="wl-hud-proc">
        <Chip on={procOn} onClick={act(() => setMicProcessingOn(!procOn))} testid="wl-hud-proc-toggle">{procOn ? 'Вкл (хрип!)' : 'Выкл'}</Chip>
      </Row>
      <Row label="Аудиосессия iOS" when="now" testid="wl-hud-session">
        {SESSION_OPTS.map(([v, t]) => <Chip key={v} on={session === v} onClick={act(() => applyAudioSessionMode(v))} testid={`wl-hud-session-${v}`}>{t}</Chip>)}
      </Row>
      <Row label="Дорожка микрофона на речь Пита" when="now" testid="wl-hud-hold">
        {HOLD_OPTS.map(([v, t]) => <Chip key={v} on={hold === v} onClick={act(() => writeMicHoldMode(v))} testid={`wl-hud-hold-${v}`}>{t}</Chip>)}
      </Row>
      <Row label="Звук награды" when="now" testid="wl-hud-reward">
        {REWARD_SOUNDS.map(v => <Chip key={v} on={reward === v} onClick={act(() => { setRewardSound(v); if (v !== 'off') unlockNotes() })} testid={`wl-hud-reward-${v}`}>{REWARD_LABEL[v] ?? 'Ноты'}</Chip>)}
      </Row>
      <Row label={`Громкость награды: ${Math.round(volume * 100)} %`} when="now" testid="wl-hud-volume">
        <input type="range" min="0" max="1" step="0.05" value={volume} aria-label="Громкость награды" onChange={e => { setRewardVolume(e.target.value); refresh() }} data-testid="wl-hud-volume-range" />
      </Row>
      <Row label="Безопасные слои пилюль (iOS)" when="now" testid="wl-hud-safe">
        <Chip on={safe} onClick={toggleSafe} testid="wl-hud-safe-toggle">{safe ? 'Вкл' : 'Выкл'}</Chip>
      </Row>
      <Row label="Тап вместо речи (проверка механики)" when="now" testid="wl-hud-tap">
        <Chip on={tap} onClick={toggleTap} testid="wl-hud-tap-toggle">{tap ? 'Вкл' : 'Выкл'}</Chip>
      </Row>
      <Row label="Скорость голоса" when="restart" testid="wl-hud-rate">
        {VOICE_RATES.map(r => <Chip key={r} on={rate === r} onClick={act(() => setVoiceRate(r))} testid={`wl-hud-rate-${r}`}>{r}×</Chip>)}
      </Row>
      <Row label="Lite-режим (слабое устройство)" when="reload" testid="wl-hud-lite">
        <Chip on={lite} onClick={act(() => writeWeakStored(!lite))} testid="wl-hud-lite-toggle">{lite ? 'Вкл' : 'Выкл'}</Chip>
      </Row>

      <Row label="Усы: rotate / transform / attr" when="now" testid="wl-hud-whiskers">
        {WHISKER_MODES.map(m => <Chip key={m} on={whisk === m} onClick={act(() => setWhiskerMode(m))} testid={`wl-hud-whiskers-${m}`}>{m}</Chip>)}
      </Row>

      <div className="wlHudActions">
        <button type="button" className="wlHudAct" onClick={download} data-no-unlock="" data-testid="wl-hud-download">Скачать отладку</button>
        <button type="button" className="wlHudAct" onClick={() => { close(); onRestartStage?.() }} data-no-unlock="" data-testid="wl-hud-stage">Перезапустить ступень</button>
        {onRestartGame && <button type="button" className="wlHudAct" onClick={() => { close(); onRestartGame() }} data-no-unlock="" data-testid="wl-hud-game">Игра заново</button>}
        <button type="button" className="wlHudAct wlHudAct--exit" onClick={onExit} data-no-unlock="" data-testid="wl-hud-exit">Выйти</button>
      </div>
      {status && <div className="wlHudStatus" role="status" data-testid="wl-hud-status">{status}</div>}
    </div>
  )
}
