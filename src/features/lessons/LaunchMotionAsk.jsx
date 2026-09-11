import { useState } from 'react'
import { Smartphone, Check } from 'lucide-react'
import { requestMotionPermission } from '../../shared/lib/motionPermission.js'

// Блок в карточке запуска — только для уроков с нодой «переверни телефон» и
// только на iOS, где датчик движения выдаётся по системному диалогу.
//
// Зачем свой шаг перед системным: диалог «Разрешить доступ к движению и
// ориентации?» без объяснения выглядит подозрительно, и на него жмут «Не
// разрешать» — а отказ iOS запоминает, второй раз спросить уже нельзя. Здесь
// человек сначала читает, зачем это, и сам нажимает «Разрешить» — тогда
// системный диалог приходит по его собственному действию и в контексте.
//
// Датчик нужен на случай системного замка поворота: тогда экран не
// поворачивается, а датчик всё равно видит, что телефон лёг набок. Если
// человек не разрешил — работает поворот экрана, урок не ломается.
export default function LaunchMotionAsk() {
  const [state, setState] = useState('idle') // idle | asking | granted | denied

  async function ask(e) {
    e.stopPropagation()
    setState('asking')
    const r = await requestMotionPermission()
    setState(r === 'granted' ? 'granted' : 'denied')
  }

  if (state === 'granted') {
    return (
      <div className="launchMotion launchMotion--ok">
        <span className="launchMotionIcon"><Check size={16} /></span>
        <span className="launchMotionText">Датчик движения включён — поворот телефона будет виден даже при заблокированном экране</span>
      </div>
    )
  }

  return (
    <div className="launchMotion">
      <span className="launchMotionIcon"><Smartphone size={16} /></span>
      <span className="launchMotionText">
        В этом уроке нужно будет повернуть телефон.
        {state === 'denied'
          ? ' Без датчика сработает поворот экрана — проверь, что он не заблокирован.'
          : ' Если поворот экрана у тебя заблокирован, разреши датчик движения.'}
      </span>
      {state !== 'denied' && (
        <button type="button" className="launchMotionBtn" onClick={ask} disabled={state === 'asking'}>
          {state === 'asking' ? '…' : 'Разрешить'}
        </button>
      )}
    </div>
  )
}
