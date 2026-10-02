// «Память слов изменилась» — сигнал данным вкладки «Память» (useLearnData в ShellV2): перечитать сразу, не дожидаясь, пока
// пользователь зайдёт на вкладку. Шлют тест-инструменты админа (memoryDebugApi.js: «＋ В обучение», «Прожить день»,
// «На сегодня», шаги слова, закрепление фразы): без сигнала точка и мозг на нижней панели, «Сегодня повторяем N слов» и
// лестница обновлялись только после захода во вкладку. Слушает один потребитель — оболочка, где живут данные вкладки.
const EVENT = 'pithy:memory-changed'

export function notifyMemoryChanged() {
  window.dispatchEvent(new Event(EVENT))
}

export function onMemoryChanged(fn) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
