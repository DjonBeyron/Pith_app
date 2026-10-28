// Подмена Web Push в странице для сценариев «Когда удобно учиться?» (ветка уведомлений, PLAN_NEW_USER.md → C2, решение 13).
// Настоящий push в headless Chromium невозможен (нет FCM, разрешение нельзя «дать» тапом), поэтому подменяем ровно то, что читает
// приложение (shared/lib/push.js): Notification.permission / requestPermission и сервис-воркер с pushManager.
// Режимы: 'ask-grant' — разрешения ещё не просили, человек разрешит; 'ask-deny' — не ещё просили, человек откажет;
// 'granted' — разрешение и подписка уже есть. Подписка при подтверждении уходит в RPC save_push_subscription (заглушка сети).
export function fakePush(page, mode) {
  return page.addInitScript(m => {
    let perm = m === 'granted' ? 'granted' : 'default'
    let subscribed = m === 'granted'
    const sub = { endpoint: 'https://push.example.test/e2e', toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: async () => true }
    const reg = { pushManager: { getSubscription: async () => (subscribed ? sub : null), subscribe: async () => { subscribed = true; return sub } } }
    Object.defineProperty(Notification, 'permission', { get: () => perm, configurable: true })
    Notification.requestPermission = async () => { perm = m === 'ask-deny' ? 'denied' : 'granted'; return perm }
    window.__pushAsked = 0
    const orig = Notification.requestPermission
    Notification.requestPermission = async () => { window.__pushAsked++; return orig() }
    navigator.serviceWorker.getRegistration = async () => reg
    navigator.serviceWorker.register = async () => reg
  }, mode)
}
