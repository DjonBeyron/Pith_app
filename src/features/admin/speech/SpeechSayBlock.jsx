import { useState } from 'react'
import { isRealLevelOn, setRealLevelOn } from '../../../shared/lib/speech/sayRealLevel.js'
import { resetMicHints } from '../../../shared/lib/speech/sayPermission.js'

// Тестовые настройки модуля «Сказать фразу» для админа (только в этом браузере, в БД ничего не пишем):
//  1) «Реальный уровень микрофона для колец (эксперимент)» — флаг localStorage `pithy_say_real_level_v1`. Кольца вокруг квадрата в модуле
//     следуют за голосом мгновенно (getUserMedia + AnalyserNode, RMS каждый кадр), а не за событиями распознавания. По умолчанию ВЫКЛЮЧЕНО:
//     параллельный захват микрофона рядом с SpeechRecognition на iPhone может сломать распознавание. Пометка «реальный уровень: вкл/выкл»
//     видна в серой плашке админа над панелью модуля.
//  2) «Сбросить подсказки микрофона» — чистит флаги попапов (полное пояснение снова станет «первым разом»), отказа и «Не могу говорить».
export default function SpeechSayBlock() {
  const [real, setReal] = useState(isRealLevelOn)
  const [done, setDone] = useState(false)
  const toggle = () => { const next = !real; setRealLevelOn(next); setReal(next) }
  const reset = () => { resetMicHints(); setDone(true) }
  return (
    <section className="aspBlock">
      <h3 className="aspH">Модуль «Сказать фразу»: настройки для тестов</h3>
      <div className="aspRow">
        <button type="button" className={`aspChip${real ? ' aspChipOn' : ''}`} onClick={toggle} aria-pressed={real} data-testid="say-real-toggle">
          Реальный уровень микрофона для колец (эксперимент): {real ? 'вкл' : 'выкл'}
        </button>
      </div>
      <p className="aspHint">Кольца вокруг квадрата реагируют на громкость голоса сразу, а не по событиям распознавания (они приходят с задержкой). Поток микрофона открывается вместе с записью и закрывается вместе с ней; при ошибке тихо включается прежний уровень. На iPhone может сломать распознавание — тогда выключите.</p>
      <div className="aspRow">
        <button type="button" className="aspChip" onClick={reset} data-testid="say-reset-hints">
          Сбросить подсказки микрофона (показать полное пояснение снова)
        </button>
        {done && <span className="aspHint">Сброшено: пояснение, отказ и «Не могу говорить» в этом браузере.</span>}
      </div>
    </section>
  )
}
