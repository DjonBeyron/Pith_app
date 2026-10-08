// Что делает нажатие на кнопку нижней панели: на уже активной вкладке —
// «домой» (назад из подэкрана этой вкладки), на другой — просто переключение.
export function navTapAction(activeTab, tappedTab) {
  return activeTab === tappedTab ? 'home' : 'switch'
}
