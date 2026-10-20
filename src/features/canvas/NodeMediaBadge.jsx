import { getNodeMediaState } from './nodeMediaStatus.js'
import { useNodeBroken } from './health/brokenStore.js'

const LABEL = {
  missing: 'Файл не загружен',
  partial: 'Фото загружены не у всех вариантов',
  ok:      'Файл загружен',
}

// Метка в правом верхнем углу ноды: приложен файл или ещё нет. У типов без
// медиа (текст, системное, регистрация…) метки нет вовсе — там нечего ждать.
// Плюс метка ⚠ «нода сломана» (health/brokenStore.js: файл потерян / ссылка 404 / пустой файл) — у любого типа с медиа, и у сцен
export default function NodeMediaBadge({ node }) {
  const state = getNodeMediaState(node)
  const broken = useNodeBroken(node.id)
  return (
    <>
      {broken && <span className="nodeBrokenBadge" title={`Сломана: ${broken.join('; ')}`}>⚠</span>}
      {state && (
        <span className={`nodeMediaBadge nodeMediaBadge_${state}`} title={LABEL[state]}>
          {state === 'ok' ? '●' : state === 'partial' ? '◍' : '○'}
        </span>
      )}
    </>
  )
}
