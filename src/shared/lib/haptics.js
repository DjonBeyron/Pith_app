// Тактильный отклик по тапу («импакт»). Вызывать ПРЯМО из обработчика жеста —
// из таймера/промиса система отклик не даст.
//
// Android/Chrome: navigator.vibrate — прямой путь.
// iOS: Vibration API Safari не поддерживает вообще, публичного haptics-API у
// веб-страниц нет. Единственный рабочий путь — системный переключатель
// <input type="checkbox" switch> (Safari 17.4+): iOS сам даёт короткий импакт,
// когда такой переключатель перекладывается. Держим один скрытый за экраном и
// кликаем по нему программно — отклик тот же, что у нативной кнопки.

let iosLabel = null

// true — импакт выдан системным переключателем (значит, это iOS)
function iosImpact() {
  if (typeof HTMLInputElement === 'undefined' || !('switch' in HTMLInputElement.prototype)) return false
  if (!iosLabel) {
    iosLabel = document.createElement('label')
    iosLabel.setAttribute('aria-hidden', 'true')
    iosLabel.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    iosLabel.appendChild(input)
    document.body.appendChild(iosLabel)
  }
  // Клик по label перекладывает переключатель — туда на один тап, обратно на
  // следующий; импакт система даёт в обе стороны одинаковый
  iosLabel.click()
  return true
}

export function haptic(ms = 12) {
  try {
    if (iosImpact()) return
    navigator.vibrate?.(ms)
  } catch { /* устройство/браузер без отклика — молча без него */ }
}
