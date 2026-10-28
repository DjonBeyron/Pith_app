import { useState } from 'react'
import { isAnimV2, setAnimV2 } from '../scene/v2/animFlags.js'
import AdminToggleRow from './AdminToggleRow.jsx'

// Переключатель «Живой Пит v2» (scene/v2/animFlags.js): у кота-маскота Пита рот двигается девятью формами по буквам слов и громкости голоса
// (огибающая audioMeta.env), зрачки следят за собеседником, усы шевелятся при речи. Выключен по умолчанию: сначала смотрим сравнение на стенде
// ?scene=cmp. Флаг лежит на этом устройстве (localStorage), на слабых телефонах работает только рот. Страницу перезагружать не нужно:
// сцена подхватывает флаг при следующем открытии.
export default function AdminAnimV2Toggle() {
  const [on, setOn] = useState(isAnimV2)
  const change = next => { setAnimV2(next); setOn(next) }
  return (
    <AdminToggleRow
      title="Живой Пит v2 (рот по буквам и громкости, зрачки)"
      on={on}
      onChange={change}
      hint="Пит двигает рот девятью формами по буквам и громкости голоса, зрачки следят за собеседником, усы шевелятся при речи. Только на этом устройстве; сравнение — страница ?scene=cmp."
      hintOn="Включено на этом устройстве: сцены с Питом откроются в новой анимации (старая сцена — после повторного открытия). На слабых телефонах — только рот."
    />
  )
}
