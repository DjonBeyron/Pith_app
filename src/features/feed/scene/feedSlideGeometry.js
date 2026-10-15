// Геометрия слайда ленты в px — ОДИН источник для ленты (SlideScene → feedFrameCalc.js) и предпросмотра «Как в ленте»
// в сборщике сцен (admin/scenes/feedFrame/). Значения замерены на живой ленте (Playwright, 390×844) и совпадают
// с CSS: feed-v2.css (.feedPhraseBlock bottom, .feedLearnBtn bottom/padding), feed-hud.css (.feedHud right/bottom),
// shell-v2.css (--v2-nav-btn-h). feedSlideGeometry.test.js сверяет эти числа с текстом CSS — разошлись, тест красный.
// Всё считается от нижнего края слайда: низ слайда лежит ПОД нижней панелью (панель — поверх, прозрачная лента).

export const NAV_BTN_H = 40        // высота кнопок нижней панели без safe-area (--v2-nav-btn-h)
export const PHRASE_BOTTOM = 92    // низ блока фразы: 92px + высота панели (.feedPhraseBlock)
export const PHRASE_LINE_H = 20    // строка фразы 17px
export const PHRASE_BASE_H = 24    // фраза = база + строки (с «подглядкой» перевода под ней)
export const PHRASE_RESERVE_LINES = 2 // сколько строк фразы закладываем под котами (длинные — 3-я строка выше)
export const LEARN_BOTTOM = 20     // низ кнопки «Изучить фразу»: 20px + высота панели (.feedLearnBtn)
export const LEARN_H = 51          // высота кнопки (padding 15 + строка 21)
export const LEARN_SIDE = 16       // поля кнопки по бокам
export const HUD_RIGHT = 16        // HUD справа: отступ от края (.feedHud right)
export const HUD_W = 31            // ширина колонки иконок
export const HUD_BOTTOM = 150      // низ HUD: 150px + высота панели
export const HUD_H = 171           // высота колонки (лайк, закладка, репост, сложность)
export const PHRASE_SIDE_R = 84    // справа от фразы свободно (padding блока фразы)
export const TOP_BAR_H = 44        // уровень/билеты/энергия + вкладки: поверх верха, плюс safe-area сверху
export const ZONE_GAP = 8          // зазор между котами и занятой зоной
export const BUBBLE_GAP = 112      // от макушек котов до низа облачка: над предметами на столе, с местом иконке паузы (64px) и хвосту облачка (16px)
export const HUD_CLEAR = 12        // воздух между облачком правого кота и HUD

// Высота нижней панели (кнопки + safe-area снизу)
export const navHeight = sab => NAV_BTN_H + Math.max(0, sab || 0)

export const phraseHeight = lines => PHRASE_BASE_H + PHRASE_LINE_H * lines

// Занятые зоны слайда (прямоугольники l,t,r,b в px слайда) и их подписи — для расчёта кадра, предупреждений
// и плашек «опасных зон» в предпросмотре. blocks — котам туда нельзя (облачко и фон — можно)
export function feedZones({ w, h, navH, safeTop = 0 }) {
  const rect = (id, label, l, t, r, b) => ({ id, label, l, t, r, b })
  const phraseB = h - (PHRASE_BOTTOM + navH)
  const learnB = h - (LEARN_BOTTOM + navH)
  const hudB = h - (HUD_BOTTOM + navH)
  return [
    rect('top', 'Верх: уровень, билеты, энергия', 0, 0, w, safeTop + TOP_BAR_H),
    rect('hud', 'HUD', w - HUD_RIGHT - HUD_W, hudB - HUD_H, w - HUD_RIGHT, hudB),
    rect('phrase', 'Фраза (шарики)', 16, phraseB - phraseHeight(PHRASE_RESERVE_LINES), w - PHRASE_SIDE_R, phraseB),
    rect('learn', 'Кнопка «Изучить фразу»', LEARN_SIDE, learnB - LEARN_H, w - LEARN_SIDE, learnB),
    rect('nav', 'Нижняя панель', 0, h - navH, w, h),
  ]
}

// Размеры экранов для предпросмотра: ширина, высота (CSS px, окно приложения целиком), safe-area снизу/сверху
export const FEED_DEVICES = [
  { id: 'iphone', label: 'iPhone 390×844', w: 390, h: 844, sab: 34, sat: 47 },
  { id: 'mini', label: '12 mini 375×812', w: 375, h: 812, sab: 34, sat: 50 },
  { id: 'android', label: 'Android 360×780', w: 360, h: 780, sab: 0, sat: 0 },
  { id: 'max', label: 'Pro Max 430×932', w: 430, h: 932, sab: 34, sat: 59 },
  // Окно браузера, а не приложения: адресная строка и панель съедают высоту — именно здесь сцена обрезалась
  { id: 'safari', label: 'Safari с панелями 390×664', w: 390, h: 664, sab: 0, sat: 0 },
]
