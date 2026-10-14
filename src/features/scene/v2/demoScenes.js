import { PALETTE_PRESETS } from './sceneConstants.js'

// Демо-сцены v2 — пример для админки, нейросети (легенда) и тестов. Обе
// проходят lintScene без ошибок (см. sceneLint.test.js).

export const demoOfficeScene = {
  version: 2,
  id: 'demo-office-work',
  title: 'Про работу',
  location: 'office',
  characters: {
    a: { kind: 'cat', gender: 'male', name: 'Рыжик', palette: PALETTE_PRESETS.ginger, stripes: true, voice: { pitch: 0.8, rate: 1 } },
    b: { kind: 'cat', gender: 'female', name: 'Дымка', palette: PALETTE_PRESETS.grey, stripes: true, voice: { pitch: 1.3, rate: 1.05 } },
  },
  slots: {
    window: 'window',
    'wall-art': 'picture',
    'wall-board': 'whiteboard',
    'wall-clock': 'wall-clock',
    'floor-left': 'floor-lamp',
    'floor-right': 'plant',
    table: 'table',
    'desk-left': 'laptop',
    'desk-center': 'papers',
    'desk-right': 'mug',
  },
  timeline: [
    { who: 'a', text: 'Дымка, у нас дедлайн по отчёту уже завтра. Ты видела письмо?', emotion: 'surprised' },
    { who: 'b', text: 'Видела. Поэтому я с утра на третьей кружке кофе.', emotion: 'tired' },
    { who: 'a', text: 'Кофе — это план? Нам ещё совещание в три часа.', emotion: 'neutral' },
    { who: 'b', text: 'Совещание про то, как мы будем успевать. Классика.', emotion: 'happy' },
    { who: 'a', text: 'Давай так: ты пишешь цифры, я рисую графики. Успеем.', emotion: 'happy', pose: 'lean' },
    { who: 'b', text: 'Договорились. Но после дедлайна — спать на подоконнике до вечера.', emotion: 'happy' },
  ],
  options: { bubbles: true, autoplay: false, loop: false },
}

export const demoCafeScene = {
  version: 2,
  id: 'demo-cafe-break',
  title: 'Кофе-брейк',
  location: 'cafe',
  characters: {
    a: { kind: 'cat', gender: 'female', name: 'Мурка', palette: PALETTE_PRESETS.cream, stripes: false, voice: { pitch: 1.4, rate: 1 } },
    b: { kind: 'cat', gender: 'male', name: 'Барсик', palette: PALETTE_PRESETS.black, stripes: false, voice: { pitch: 0.7, rate: 0.95 } },
  },
  slots: {
    window: 'window',
    'wall-art': 'picture',
    'wall-menu': 'menu-board',
    ceiling: 'pendant-lamp',
    counter: 'coffee-machine',
    'floor-left': 'plant',
    'floor-right': 'floor-lamp',
    table: 'table',
    'table-left': 'coffee-cup',
    'table-right': 'pastry-plate',
  },
  timeline: [
    { who: 'a', text: 'Барсик, ты опять заказал самый большой капучино?', emotion: 'surprised' },
    { who: 'b', text: 'Это не большой. Это нормальный. Просто чашка маленькая.', emotion: 'neutral' },
    { who: 'a', text: 'Чашка размером с ведро, вообще-то.', emotion: 'happy' },
    { who: 'b', text: 'Зато круассан — один. Видишь, я умею в баланс.', emotion: 'happy', pose: 'lean' },
    { who: 'a', text: 'Ладно, половину круассана — мне. За баланс.', emotion: 'happy' },
  ],
  options: { bubbles: true, autoplay: false, loop: false },
}

export const DEMO_SCENES = [demoOfficeScene, demoCafeScene]
