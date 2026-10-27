// Определение iOS без обращения к window (чистая функция, nav передаётся — удобно тестировать).
// iPadOS 13+ в Safari выдаёт себя за Mac: UA «Macintosh», platform «MacIntel», — но у Mac нет сенсора,
// а у iPad maxTouchPoints 5. Нужно для веток «добавь на экран Домой» (pwaInstall.js, push.js, «Когда удобно учиться?»):
// в обычной вкладке Safari на iPad Push API нет, и обещать уведомление нельзя
export function isIOSNavigator(nav) {
  if (/iPhone|iPad|iPod/.test(nav?.userAgent ?? '')) return true
  return nav?.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1
}
