// Эксперимент «варианты запуска» (поиск моргания на iPhone): список вариантов и чтение/запись выбора.
// Выбор лежит в localStorage; его читает САМЫЙ ПЕРВЫЙ inline-скрипт в <head> index.html (до первого кадра) —
// ключ и список букв там дублируются, тест startVariantScript.test.js следит, чтобы они не разошлись.
export const VARIANT_KEY = 'pithy_start_variant_v1'
export const DEFAULT_VARIANT = 'A'

export const VARIANTS = [
  { id: 'A', title: 'Основной', text: 'Как сейчас: чёрный фон задан атрибутом style прямо на <html> и <body> и стилем в самом начале, теги color-scheme и theme-color стоят ПОСЛЕ него. Лого проявляется из чёрного вместе со свечением.' },
  { id: 'B', title: 'Без color-scheme и theme-color', text: 'Те два тега убраны из страницы до первого кадра, тёмная схема не задана. Проверяет: не они ли красят холст в серый.' },
  { id: 'C', title: 'Мгновенное лого без свечения', text: 'Лого есть с самого первого кадра (без проявления) и без свечения вокруг. Проверяет: не бледная вспышка свечения при проявлении.' },
  { id: 'D', title: 'Без лого', text: 'Пока приложение грузится, экран чисто чёрный: ни лого, ни подписи версии. Проверяет: пропадёт ли моргание, если проявлять нечего.' },
  { id: 'E', title: 'Только без color-scheme', text: 'Убран только тег color-scheme, theme-color остаётся. Если на B нет моргания, а на E есть, виноват именно theme-color.' },
]

export const VARIANT_IDS = VARIANTS.map(v => v.id)

// Любое неизвестное значение (нет записи, мусор, старая буква) — основной вариант A
export function normalizeVariant(v) {
  return VARIANT_IDS.includes(v) ? v : DEFAULT_VARIANT
}

export function readVariant() {
  try { return normalizeVariant(localStorage.getItem(VARIANT_KEY)) } catch { return DEFAULT_VARIANT }
}

// Пишет нормализованное значение; false, если хранилище недоступно (приватный режим и т.п.)
export function writeVariant(v) {
  try { localStorage.setItem(VARIANT_KEY, normalizeVariant(v)); return true } catch { return false }
}

// Вариант, с которым запущена ЭТА загрузка (его выставил скрипт в <head>)
export function runningVariant() {
  return normalizeVariant(typeof window !== 'undefined' ? window.__startVariant : undefined)
}
