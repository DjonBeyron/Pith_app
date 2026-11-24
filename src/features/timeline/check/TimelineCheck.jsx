import { useState } from 'react'
import TimelineListen from '../TimelineListen.jsx'
import TimelineScenario from './TimelineScenario.jsx'
import '../../../styles/timeline-check.css'

// Вкладка «Проверка 🎧» экрана «Таймлайн игры»: переключатель источника списка реплик —
//   «Сценарий сейчас (все ветки)» (по умолчанию): полный сценарий «Встряхни память» из кода игры с проверкой каждой реплики (TimelineScenario.jsx) — прохождение не нужно;
//   «Последняя игра»: реплики выбранного прохождения по стадиям, как было во вкладке «Прослушать» (TimelineListen.jsx: случайные варианты и только пройденные ветки этой игры).
// m — модель прохождения (null — игр нет: доступен только сценарий); res — scenarioCheck.checkScenario; edit — useLineEdit; src0 — начальный источник (тесты, стенд).
export default function TimelineCheck({ m = null, res, edit, audio = null, make, src0 = 'now', only0 = false, open0 = null }) {
  const [src, setSrc] = useState(src0 === 'run' && m ? 'run' : 'now')
  return (
    <div className="tlCkWrap" data-testid="tl-check">
      <div className="tlGroup tlCkSrc" role="radiogroup" aria-label="Откуда список реплик">
        <button type="button" role="radio" aria-checked={src === 'now'} className="tlChip" onClick={() => setSrc('now')} data-testid="tl-ck-src-now">Сценарий сейчас (все ветки)</button>
        <button type="button" role="radio" aria-checked={src === 'run'} className="tlChip" disabled={!m} onClick={() => setSrc('run')} title={m ? 'Реплики выбранного прохождения: только то, что прозвучало в этой игре' : 'Игр пока нет'} data-testid="tl-ck-src-run">Последняя игра</button>
      </div>
      {src === 'run' && m ? <TimelineListen m={m} audio={audio} make={make} />
        : edit ? <TimelineScenario res={res} edit={edit} audio={audio} make={make} only0={only0} open0={open0} />
          : <p className="tlMuted" data-testid="tl-ck-off">Настройки реплик на этом экране не подключены — проверка сценария недоступна.</p>}
    </div>
  )
}
