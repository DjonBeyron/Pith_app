import { useState, useSyncExternalStore } from 'react'
import { SAY_ENGINE_MODES, SAY_ENGINE_LABEL, readSayEngine, writeSayEngine } from '../../../shared/lib/speech/sayEngineMode.js'
import { getLastEngine, subscribeLastEngine } from '../../../shared/lib/speech/sayEngineLast.js'
import { pickLabel } from '../../../shared/lib/speech/sayEnginePick.js'
import { voskRuntime } from '../../../shared/lib/vosk/voskRuntime.js'

// Админская настройка движка распознавания модуля «Сказать фразу» (sayEngineMode.js, localStorage `pithy_say_engine_v1`): Авто (Vosk, если готов) — по умолчанию /
// Только системное / Только Vosk, плюс строка «последняя попытка шла на: …» и короткое состояние Vosk в памяти. Обычным пользователям ничего не показывается (секция только в админке).
const yn = v => (v === null ? 'не проверяли' : v ? 'да' : 'нет')
const clock = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

export default function SpeechSayEngine() {
  const [mode, setMode] = useState(readSayEngine)
  const last = useSyncExternalStore(subscribeLastEngine, getLastEngine)
  const pick = m => { setMode(writeSayEngine(m)); voskRuntime.clearBroken() } // сменили режим — прежний «сбой Vosk» забываем
  const snap = voskRuntime.snapshot()
  const broken = snap.broken ? `; сбой до ${clock(snap.brokenUntil)} (${snap.brokenWhy})` : ''
  return (
    <>
      <div className="aspRow" role="group" aria-label="Движок распознавания модуля">
        <span className="aspLabelInline">Движок распознавания</span>
        {SAY_ENGINE_MODES.map(m => (
          <button key={m} type="button" className={`aspChip${mode === m ? ' aspChipOn' : ''}`} onClick={() => pick(m)} aria-pressed={mode === m} data-testid={`say-engine-${m}`}>
            {SAY_ENGINE_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="aspHint" data-testid="say-engine-last">
        Последняя попытка шла на: {last ? pickLabel(last) : 'ещё не было попыток в этом запуске'}.
        {' '}Vosk сейчас: модель в кэше — {yn(snap.cached)}, в памяти — {yn(snap.loaded)}{snap.loading ? ' (грузится)' : ''}{broken}.
      </p>
      <p className="aspHint">«Авто»: Vosk (закрытый словарь, на устройстве), если к нажатию он готов — модель в кэше и уже в памяти; иначе системное распознавание, без ожидания и сообщений ученику. «Только Vosk» (только для проверок): не готов — тап ждёт прогрев до 20 с, этап виден в серой плашке над панелью; не вышло — на системное НЕ уходим, плашка и диагностика (кнопка «i» в панели) показывают причину. Модель греется при входе в урок с модулем «Сказать фразу» (если её нет в кэше — сразу качается) и держится до 30 с после выхода из урока.</p>
    </>
  )
}
