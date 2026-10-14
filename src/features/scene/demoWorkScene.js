// Демо-сценарий стенда: два кота обсуждают работу. Формат — см. sceneSchema.js

export const demoWorkScene = {
  version: 1,
  background: 'office',
  characters: [
    {
      id: 'ryzhik',
      name: 'Рыжик',
      colors: { body: '#f2a65a', belly: '#fde7c8', ear: '#f6a9a3', eye: '#5aa36b', nose: '#e58a8a', stripe: '#d9843d' },
      voice: { pitch: 0.8, rate: 1.0 },
    },
    {
      id: 'dymka',
      name: 'Дымка',
      colors: { body: '#8e97a8', belly: '#e9ecf2', ear: '#f1b7c4', eye: '#e2b14c', nose: '#d98f9b', stripe: '#6f7889' },
      voice: { pitch: 1.3, rate: 1.05 },
    },
  ],
  timeline: [
    { who: 'ryzhik', text: 'Дымка, у нас дедлайн по отчёту уже завтра. Ты видела письмо?', emotion: 'surprised' },
    { who: 'dymka', text: 'Видела. Поэтому я с утра на третьей кружке кофе.', emotion: 'tired' },
    { who: 'ryzhik', text: 'Кофе — это план? Нам ещё совещание в три часа.', emotion: 'neutral' },
    { who: 'dymka', text: 'Совещание про то, как мы будем успевать. Классика.', emotion: 'happy' },
    { who: 'ryzhik', text: 'Давай так: ты пишешь цифры, я рисую графики. Успеем.', emotion: 'happy', pose: 'lean' },
    { who: 'dymka', text: 'Договорились. Но после дедлайна — спать на подоконнике до вечера.', emotion: 'happy' },
    { who: 'ryzhik', text: 'Это я одобряю. Подоконник — лучшая переговорка.', emotion: 'happy' },
  ],
}
