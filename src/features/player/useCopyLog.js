import { useState } from 'react'

// Копия лога в буфер с кратким результатом. Внутри Telegram WebView
// синтетический клик по <a download> на части устройств не срабатывает молча
// (файл просто не появляется) — копия в буфер работает там, где скачивание
// нет. copyState — null | 'ok' | 'err': подпись результата вместо тихого
// «ничего не произошло». Нужен и меню шестерёнки (админ), и кнопке в шапке
// (ученик, если админ включил диагностику для всех)
export function useCopyLog(onCopyLog) {
  const [copyState, setCopyState] = useState(null)

  async function handleCopy() {
    try {
      await onCopyLog?.()
      setCopyState('ok')
    } catch {
      setCopyState('err')
    }
    setTimeout(() => setCopyState(null), 1500)
  }

  return [copyState, handleCopy]
}
