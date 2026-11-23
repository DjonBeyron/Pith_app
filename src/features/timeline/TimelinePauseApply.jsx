import { useState } from 'react'
import { changesText, MIGRATION_NOTE } from './pauseDraft.js'
import { sec as dur } from './montage/montageEditsText.js'

// Применение черновика настроек пауз (панель «⚙ Настройки пауз»). Два пути — разные по смыслу и цвету:
//  • «📱 Попробовать на этом устройстве» (зелёный, безопасный): значения ложатся в память ЭТОГО браузера и действуют со следующей игры только здесь; рядом — «снять с этого устройства».
//  • «🌍 Применить для всех игроков» (оранжевый, с подтверждением): запись на сервер — игра изменится у всех со следующего запуска; перед записью показан перечень «настройка: было → стало».
// И сброс к умолчаниям — отдельно для устройства и для сервера (тоже с подтверждением). Отмена и возврат шагов черновика — здесь же. knobs — usePauseKnobs.
export default function TimelinePauseApply({ knobs, ask0 = '' }) {
  const [ask, setAsk] = useState(ask0) // '' | 'server' | 'reset-server' | 'reset-device'
  const k = knobs, busy = !!k.busy
  const serverDiff = k.serverChanges.length
  const run = fn => async () => { setAsk(''); await fn() }
  return (
    <div className="tlApply" data-testid="tl-apply">
      <div className="tlApplyRow">
        <button type="button" className="tlChip" onClick={k.undo} disabled={!k.canUndo || busy} title="Отменить шаг черновика" data-testid="tl-apply-undo">↶ отменить</button>
        <button type="button" className="tlChip" onClick={k.redo} disabled={!k.canRedo || busy} title="Вернуть шаг черновика" data-testid="tl-apply-redo">↷ вернуть</button>
        <button type="button" className="tlChip" onClick={k.discard} disabled={!k.dirty || busy} title="Бросить черновик: на экране снова то, что действует сейчас" data-testid="tl-apply-discard">бросить черновик</button>
        <b className="tlApplyDraft" data-testid="tl-apply-draft" data-dirty={k.dirty ? '1' : '0'}>{k.dirty ? `Черновик: ${changesText(k.changes)}` : 'Черновик пуст — на экране то, что действует сейчас'}</b>
      </div>
      <div className="tlApplyWays">
        <div className="tlApplyWay" data-way="device">
          <button type="button" className="tlBtn tlApplyDevice" onClick={k.applyDevice} disabled={busy || !k.dirty} data-testid="tl-apply-device">{k.busy === 'device' ? 'сохраняю…' : '📱 Попробовать на этом устройстве'}</button>
          <p>Только этот телефон или компьютер, со следующей игры. Другие игроки ничего не заметят. <b>Безопасно</b> — с этого и начинай.</p>
          <button type="button" className="tlLink" onClick={() => setAsk('reset-device')} disabled={busy || !k.deviceCount} data-testid="tl-apply-clear">снять с этого устройства{k.deviceCount ? ` (${k.deviceCount})` : ''}</button>
        </div>
        <div className="tlApplyWay" data-way="server">
          <button type="button" className="tlBtn tlApplyServer" onClick={() => setAsk('server')} disabled={busy || !serverDiff} data-testid="tl-apply-server">{k.busy === 'server' ? 'сохраняю…' : '🌍 Применить для всех игроков'}</button>
          <p>Игра изменится <b>у всех</b>, со следующего запуска. Сначала попробуй на своём устройстве. <span className="tlApplyMig" data-testid="tl-apply-mig">Важно: {MIGRATION_NOTE}.</span></p>
          <button type="button" className="tlLink" onClick={() => setAsk('reset-server')} disabled={busy || !k.serverCount} data-testid="tl-apply-reset-server">↺ сбросить на сервере всё к умолчаниям{k.serverCount ? ` (${k.serverCount})` : ''}</button>
        </div>
      </div>
      {ask === 'server' && (
        <div className="tlApplyAsk" data-testid="tl-apply-ask">
          <p><b>Применить для всех игроков?</b> Изменится игра у всех, со следующего запуска. Что станет на сервере:</p>
          <ul>{k.serverChanges.map(x => <li key={x.key}>{x.title}: {dur(x.from)} → <b>{dur(x.to)}</b></li>)}</ul>
          <p className="tlApplyMig">{MIGRATION_NOTE}.</p>
          <div className="tlApplyRow"><button type="button" className="tlBtn tlApplyServer" onClick={run(k.applyServer)} data-testid="tl-apply-confirm">Да, изменить игру у всех</button><button type="button" className="tlBtn" onClick={() => setAsk('')}>Отмена</button></div>
        </div>
      )}
      {ask === 'reset-server' && (
        <div className="tlApplyAsk" data-testid="tl-apply-ask">
          <p><b>Сбросить на сервере все паузы к умолчаниям?</b> У всех игроков игра вернётся к исходным паузам со следующего запуска. Черновик на экране останется.</p>
          <div className="tlApplyRow"><button type="button" className="tlBtn tlApplyServer" onClick={run(k.resetServer)} data-testid="tl-apply-confirm">Да, сбросить у всех</button><button type="button" className="tlBtn" onClick={() => setAsk('')}>Отмена</button></div>
        </div>
      )}
      {ask === 'reset-device' && (
        <div className="tlApplyAsk" data-testid="tl-apply-ask">
          <p><b>Снять свои значения с этого устройства?</b> Здесь будет действовать то же, что у всех игроков. Черновик на экране останется.</p>
          <div className="tlApplyRow"><button type="button" className="tlBtn tlApplyDevice" onClick={run(k.clearDevice)} data-testid="tl-apply-confirm">Да, снять</button><button type="button" className="tlBtn" onClick={() => setAsk('')}>Отмена</button></div>
        </div>
      )}
      {k.note && <p className="tlApplyNote" data-testid="tl-apply-note">{k.note}</p>}
      {k.error && <p className="tlApplyErr" role="alert" data-testid="tl-apply-error">{k.error}</p>}
    </div>
  )
}
