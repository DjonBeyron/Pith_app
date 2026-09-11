import { Zap, RefreshCw } from 'lucide-react'
import EnergyCells from '../../shared/ui/EnergyCells.jsx'

// Строка про энергию в карточке запуска. Отдельный компонент, потому что рисуется
// дважды: пока урок грузится и когда он готов — на одном и том же месте и в одном
// и том же виде, чтобы при доезде сценария ничего не дёргалось.
export default function LaunchEnergyRow({ info, dissolving = false }) {
  const { payingCase, unlimited, energyValue, label, icon } = info
  const CostIcon = icon === 'retake' ? RefreshCw : Zap

  if (payingCase) return <EnergyCells value={energyValue} blinkLast={!dissolving} dissolving={dissolving} />
  // Безлимит (админ/подписка): тот же ряд ячеек, но полный и с «∞» — чтобы
  // новый UI был виден и здесь, а не только текстом
  if (unlimited)  return <EnergyCells unlimited />
  if (!label)     return null

  return (
    <span style={{ color: '#bbb', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
      <CostIcon size={13} />{label}
    </span>
  )
}
