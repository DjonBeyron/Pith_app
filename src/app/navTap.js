// Что делает нажатие на кнопку нижней панели: на уже активной вкладке —
// «домой» (назад из подэкрана этой вкладки), на другой — просто переключение.
export function navTapAction(activeTab, tappedTab) {
  return activeTab === tappedTab ? 'home' : 'switch'
}

// Нажатие на «Память»: отметить первое нажатие (вкладка перестаёт мерцать), на уже активной — «домой»
// (назад из списка слов), затем переключить на неё
export function learnTap(activeTab, { setTab, requestHome, onMemoryTap }) {
  onMemoryTap?.()
  if (navTapAction(activeTab, 'learn') === 'home') requestHome()
  setTab('learn')
}
