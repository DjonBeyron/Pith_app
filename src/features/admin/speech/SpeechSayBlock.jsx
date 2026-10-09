import { useState } from 'react'
import { isRealLevelOn, setRealLevelOn } from '../../../shared/lib/speech/sayRealLevel.js'
import { resetMicHints } from '../../../shared/lib/speech/sayPermission.js'
import { isSayAudioSessionOn, setSayAudioSessionOn } from '../../../shared/lib/speech/sayAudioSession.js'
import { readSayDwell, writeSayDwell } from '../../../shared/lib/speech/sayDwell.js'
import { DWELL_PRESETS, DWELL_DEFAULT } from '../../../shared/lib/speech/flashDwell.js'

// Тестовые настройки модуля «Сказать фразу» для админа (только в этом браузере, в БД ничего не пишем):
//  1) «Реальный уровень микрофона для колец (эксперимент)» — флаг localStorage `pithy_say_real_level_v1`. Кольца вокруг квадрата в модуле
//     следуют за голосом мгновенно (getUserMedia + AnalyserNode, RMS каждый кадр), а не за событиями распознавания. По умолчанию ВЫКЛЮЧЕНО:
//     параллельный захват микрофона рядом с SpeechRecognition на iPhone может сломать распознавание. Пометка «реальный уровень: вкл/выкл»
//     видна в серой плашке админа над панелью модуля.
//  2) «Аудиосессия play-and-record для модуля (эксперимент)» — флаг localStorage `pithy_say_audiosession_v1` ('0' = выкл), ПО УМОЛЧАНИЮ ВКЛ (S6 снял «глухие» запуски). Модуль на время записи ставит
//     navigator.audioSession.type = 'play-and-record' (до start(), в том же тапе) и возвращает 'auto' после (speechAudioSession.js). Пометка «аудиосессия: play-and-record» —
//     в серой плашке админа над панелью. Побочный эффект — вывод на ресивер, только на время записи. iOS < 16.4 — переключатель ничего не делает.
//  3) «Порог мелькания ошибочной формы (мс)» для режима «Строго» — localStorage `pithy_say_dwell_v1`, по умолчанию 500 (как было); пресеты 0/150/300/500. 0 = любое появление ошибочной формы
//     в потоке interim засчитывается как ошибка. Выставляется после контрольной серии в «Тесте 1» (sayDwell.js, матчер matchStrict читает его сам).
//  4) «Сбросить подсказки микрофона» — чистит флаги попапов (полное пояснение снова станет «первым разом»), отказа и «Не могу говорить».
export default function SpeechSayBlock() {
  const [real, setReal] = useState(isRealLevelOn)
  const [sess, setSess] = useState(isSayAudioSessionOn)
  const [dwell, setDwell] = useState(readSayDwell)
  const [done, setDone] = useState(false)
  const toggle = () => { const next = !real; setRealLevelOn(next); setReal(next) }
  const toggleSess = () => { const next = !sess; setSayAudioSessionOn(next); setSess(next) }
  const pickDwell = v => setDwell(writeSayDwell(v))
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
        <button type="button" className={`aspChip${sess ? ' aspChipOn' : ''}`} onClick={toggleSess} aria-pressed={sess} data-testid="say-audiosession-toggle">
          Аудиосессия play-and-record для модуля: {sess ? 'вкл' : 'выкл'}
        </button>
      </div>
      <p className="aspHint">На время записи модуль ставит navigator.audioSession.type = «play-and-record» (до старта записи, в том же тапе) и возвращает «auto» после результата, ошибки или остановки. Лечит «глухие» вторые запуски, если их причина — аудиосессия iOS. Побочный эффект: звук на это время может идти через ресивер. Нужен iOS 16.4+ (иначе ничего не делает). В серой плашке админа над панелью — пометка «аудиосессия: play-and-record».</p>
      <div className="aspRow" role="group" aria-label="Порог мелькания ошибочной формы">
        <span className="aspLabelInline">Порог мелькания ошибочной формы (мс)</span>
        {DWELL_PRESETS.map(v => (
          <button key={v} type="button" className={`aspChip${dwell === v ? ' aspChipOn' : ''}`} onClick={() => pickDwell(v)} aria-pressed={dwell === v} data-testid={`say-dwell-${v}`}>
            {v}{v === DWELL_DEFAULT ? ' (по умолч.)' : ''}
          </button>
        ))}
      </div>
      <p className="aspHint">Только для режима «Строго»: если движок сначала показал ошибочную форму («I'm try»), а потом исправил на «I'm trying», и форма простояла на экране дольше порога — слово не засчитывается. 0 = ловить любое появление формы, 500 — как раньше. Выберите по таблице порогов из «Теста 1» ниже (максимум пойманных ошибок при нуле ложных тревог). Сейчас: {dwell} мс.</p>
      <div className="aspRow">
        <button type="button" className="aspChip" onClick={reset} data-testid="say-reset-hints">
          Сбросить подсказки микрофона (показать полное пояснение снова)
        </button>
        {done && <span className="aspHint">Сброшено: пояснение, отказ и «Не могу говорить» в этом браузере.</span>}
      </div>
    </section>
  )
}
