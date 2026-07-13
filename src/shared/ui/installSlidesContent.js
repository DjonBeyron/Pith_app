// Контент слайдов установки — отдельно от компонента (InstallSlides.jsx),
// чтобы вёрстка/логика листания не тонула среди текста.
// Всегда РОВНО 3 слайда: 1) интро (серым — что это браузерная версия) +
// предупреждение (красным), что часть функций ограничена без установки;
// 2) пошаговая инструкция под определённый браузер (см.
// pwaInstall.detectBrowser) — явные шаги «1. Нажми… 2. Выбери…», плюс
// подсказка на случай, если пункта нет/не срабатывает; 3) готово.
const INTRO_SLIDE = {
  icon: 'phone',
  title: 'Установи приложение',
  text: 'Вы используете браузерную версию приложения',
  warn: 'Без установки часть функций будет ограничена — приложение работает в полную силу только установленным',
}

const FINAL_SLIDE = {
  icon: 'settings',
  title: 'Готово!',
  text: 'Эту инструкцию всегда можно найти в Профиль → Настройки',
}

// Chromium с пойманным beforeinstallprompt (Chrome/Samsung Internet/Edge) —
// один слайд с настоящей кнопкой установки вместо похода по меню, шаги тут
// не нужны — само нажатие «Установить» и есть единственное действие
const REAL_INSTALL_SLIDE = {
  icon: 'install',
  title: 'Нажми «Установить»',
  text: 'Сейчас появится системное окно — подтверди установку',
  action: 'install',
}

// Если пункта нет в меню или тап по нему ничего не делает — не заявляем
// точную причину (не можем знать наверняка), просто честный совет
const NO_OPTION_HINT = 'Нет такого пункта или ничего не происходит — обнови браузер, либо смартфон не поддерживает эту функцию'

const MENU_INSTRUCTION = {
  chrome:   { icon: 'menu', steps: ['Нажми «⋮» (три точки) в углу экрана', 'Выбери «Добавить на главный экран»'], text: NO_OPTION_HINT },
  samsung:  { icon: 'menu', steps: ['Нажми «☰» внизу экрана', 'Выбери «Добавить страницу в»', 'Нажми «На начальный экран»'], text: NO_OPTION_HINT },
  yandex:   { icon: 'menu', steps: ['Нажми «⋮» (три точки)', 'Выбери «Добавить на главный экран»'], text: NO_OPTION_HINT },
  firefox:  { icon: 'menu', steps: ['Нажми «⋮»', 'Выбери «Установить» (или «Добавить на главный экран»)'], text: NO_OPTION_HINT },
  edge:     { icon: 'menu', steps: ['Нажми «⋯» внизу экрана', 'Выбери «Добавить на телефон»'], text: NO_OPTION_HINT },
  other:    { icon: 'menu', steps: ['Открой меню браузера', 'Найди «Установить приложение»'], text: NO_OPTION_HINT },
}

const IOS_INSTRUCTION = {
  icon: 'share',
  steps: ['Нажми «Поделиться» внизу экрана Safari', 'Выбери «На экран «Домой»»', 'Нажми «Добавить»'],
}

const CHROMIUM = new Set(['chrome', 'samsung', 'edge'])

export function getSlides(browser, hasPrompt) {
  const instruction = browser === 'ios'
    ? IOS_INSTRUCTION
    : CHROMIUM.has(browser) && hasPrompt ? REAL_INSTALL_SLIDE : (MENU_INSTRUCTION[browser] ?? MENU_INSTRUCTION.other)
  return [INTRO_SLIDE, instruction, FINAL_SLIDE]
}
