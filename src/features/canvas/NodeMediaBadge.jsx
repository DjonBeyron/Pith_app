import { getNodeMediaState } from './nodeMediaStatus.js'

const LABEL = {
  missing: 'Файл не загружен',
  partial: 'Фото загружены не у всех вариантов',
  ok:      'Файл загружен',
}

// Метка в правом верхнем углу ноды: приложен файл или ещё нет. У типов без
// медиа (текст, системное, регистрация…) метки нет вовсе — там нечего ждать.
export default function NodeMediaBadge({ node }) {
  const state = getNodeMediaState(node)
  if (!state) return null
  return (
    <span className={`nodeMediaBadge nodeMediaBadge_${state}`} title={LABEL[state]}>
      {state === 'ok' ? '●' : state === 'partial' ? '◍' : '○'}
    </span>
  )
}
