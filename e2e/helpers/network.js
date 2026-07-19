// Эмуляция медленной сети (3G) через CDP — понадобится этапам C и E, чтобы
// ловить баги таймингов (стоп-кадр видео, гонки предзагрузки). Chromium-only.

// Профиль «медленный 3G» — числа как в DevTools.
const SLOW_3G = {
  offline: false,
  downloadThroughput: (500 * 1024) / 8, // ~500 Кбит/с
  uploadThroughput:   (500 * 1024) / 8,
  latency: 400,                          // мс
}

// Включает эмуляцию 3G для страницы. Возвращает функцию-выключатель.
export async function throttle3G(page) {
  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', SLOW_3G)
  return async () => {
    await client.send('Network.emulateNetworkConditions', {
      offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0,
    })
    await client.detach()
  }
}
