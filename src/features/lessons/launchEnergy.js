import { getCachedProfile } from '../../shared/api/profileCache.js'
import { calcEnergy } from '../../shared/lib/energyCalc.js'

// Что карточка запуска говорит про энергию. Живёт отдельно, потому что НЕ
// зависит от сценария урока: профиль уже в кэше, остальное — пропсы. Значит
// строку можно показать в первый же кадр, не дожидаясь загрузки урока по сети
// (раньше весь этот блок ждал сценария и дорисовывался через полсекунды).
//
// Надпись информационная: сколько списать, решает сервер (start_lesson).
// Гость энергию не тратит — ему не показываем ничего.
export function launchEnergyInfo({ retake = false, energyFree = false, openedAt }) {
  const profile   = getCachedProfile()
  const unlimited = !!(profile?.has_subscription || profile?.is_admin)

  return {
    profile,
    unlimited,
    // Платный случай (не гость, не безлимит, не пересдача, не Старт/Финал) —
    // вместо текста рисуется ряд ячеек энергии с мигающей последней
    payingCase: !!profile && !unlimited && !retake && !energyFree,
    energyValue: profile ? calcEnergy(profile, openedAt).value : 0,
    icon: !unlimited && retake ? 'retake' : 'zap',
    label: !profile
      ? null
      : unlimited
        ? 'Безлимит — энергия не тратится'
        : retake
          ? 'Повторение пройденного — бесплатно'
          : energyFree
            ? 'Этот урок бесплатный — энергия не тратится'
            : 'Урок спишет 1 энергию',
  }
}
