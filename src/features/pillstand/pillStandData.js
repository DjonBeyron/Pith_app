// Цели стенда пилюль (отладка, CONCEPT_PILLSTAND.md): слова и фразы с переводом, короткие и длинные — чтобы проверить слух Vosk и реакцию пилюли на разной длине.
// Слова — частые (есть в маленьких моделях vosk-model-small-en-us / ru), фразы — бытовые. Английская цель: говорят en, на пилюле ru (как проход A «Пинг-понга»); русская — наоборот (как проход B).
// Плюс слова и фразы самой игры (дежурные слова, фикстура фраз), чтобы стенд проверял и их. Чистые данные.
import { STANDBY_WORDS } from '../pitrace/raceStandby.js'
import { PHRASE_FIXTURE } from '../pitrace/racePhraseFixture.js'

const W = [
  ['cat', 'кот'], ['dog', 'собака'], ['sun', 'солнце'], ['red', 'красный'], ['book', 'книга'], ['milk', 'молоко'], ['house', 'дом'], ['water', 'вода'],
  ['green', 'зелёный'], ['happy', 'счастливый'], ['friend', 'друг'], ['money', 'деньги'], ['night', 'ночь'], ['city', 'город'], ['window', 'окно'], ['summer', 'лето'],
  ['beautiful', 'красивый'], ['yesterday', 'вчера'], ['important', 'важный'], ['together', 'вместе'], ['tomorrow', 'завтра'], ['breakfast', 'завтрак'],
  ['interesting', 'интересный'], ['everything', 'всё'], ['different', 'разный'], ['children', 'дети'], ['question', 'вопрос'], ['understand', 'понимать'],
  ['remember', 'помнить'], ['beginning', 'начало'], ['wonderful', 'чудесный'], ['difficult', 'трудный'],
]

const P = [
  ['Good morning', 'Доброе утро'], ['Thank you', 'Спасибо тебе'], ['How are you', 'Как дела'], ['See you later', 'Увидимся позже'], ['I love you', 'Я тебя люблю'],
  ['Nice to meet you', 'Приятно познакомиться'], ['Where are you from', 'Откуда ты'], ["I'm trying to learn", 'Я пытаюсь учиться'], ['Thank you very much', 'Большое спасибо'],
  ['What time is it', 'Который час'], ['I would like a cup of coffee', 'Я хотел бы чашку кофе'], ['Can you help me please', 'Помоги мне пожалуйста'],
  ["I don't understand what you mean", 'Я не понимаю что ты имеешь в виду'], ["Let's go to the park tomorrow", 'Давай пойдём в парк завтра'],
  ['The weather is very nice today', 'Сегодня очень хорошая погода'], ['I want to learn English every day', 'Я хочу учить английский каждый день'],
  ['My brother lives in a big city', 'Мой брат живёт в большом городе'], ['Do you know where the station is', 'Ты знаешь где вокзал'],
]

const uniq = list => { const seen = new Set(); return list.filter(([en]) => { const k = en.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }) }

/** Слова: [{ en, ru }] — свои и дежурные слова игры */
export const STAND_WORDS = uniq([...W, ...STANDBY_WORDS.map(w => [w.text, w.translation])]).map(([en, ru]) => ({ en, ru }))

/** Фразы: [{ en, ru }] — свои и фикстура фраз игры (у фикстуры ru — смысл-намерение; перевод берём свой, где фраза совпадает) */
export const STAND_PHRASES = uniq([...P, ...PHRASE_FIXTURE.map(p => [p.text, P.find(([en]) => en.toLowerCase() === p.text.toLowerCase())?.[1] ?? ''])]).filter(([, ru]) => ru).map(([en, ru]) => ({ en, ru }))
