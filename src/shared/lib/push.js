import { supabase } from '../api/supabase.js'

// Web Push: подписка/отписка браузера на системные уведомления.
// Сервис-воркер public/push-sw.js — только пуши, без кэширования.
// Публичный VAPID-ключ не секрет (он и так виден в подписке);
// приватная пара хранится в секретах Supabase (edge-функция push-send).
const VAPID_PUBLIC_KEY =
  'BLn3CeESxW6IPhSQSyTVg-gGIgSgITiMFoLb7H-9j1e-V96xtzncNpmDJLQ3hLgi_Stn-SAxhCjAU8rYlElCoRw'

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Поддерживается ли push здесь. На iOS Push API появляется ТОЛЬКО у
// приложения, добавленного на домашний экран, — в Safari его нет.
export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// iPhone/iPad без установки на экран Домой — подсказать пользователю
export function needsHomeScreen() {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
  return isIos && !standalone && !pushSupported()
}

// Текущее состояние: unsupported | denied | on | off
export async function getPushState() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
  const sub = reg && await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

// Включить уведомления. Вызывать ТОЛЬКО из обработчика тапа (требование iOS).
export async function subscribePush() {
  const reg = await navigator.serviceWorker.register('/push-sw.js')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denied' : 'dismissed')
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const json = sub.toJSON()
  const { data: { session } } = await supabase.auth.getSession()
  // Не upsert: ON CONFLICT требует SELECT-видимости существующей строки, а
  // SELECT клиентам закрыт намеренно (политики RLS). Удалить-и-вставить по
  // endpoint даёт тот же результат без чтения.
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint: sub.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_id: session?.user?.id ?? null,
    ua: navigator.userAgent.slice(0, 200),
  })
  if (error) {
    // Сервер не записал — откатываем подписку браузера, чтобы не было
    // «включено, но пуши не приходят»
    await sub.unsubscribe().catch(() => {})
    throw new Error(error.message)
  }
  return sub
}

// Выключить уведомления: снять подписку браузера и удалить строку на сервере
export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
  const sub = reg && await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
