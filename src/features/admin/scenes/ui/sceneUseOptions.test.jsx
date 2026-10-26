import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sceneUseMode, sceneUseOptions, USE_IN_LESSON_HINT } from './sceneUseOptions.js'
import { templateList, needsTemplateConfirm, templateScene, linesNote } from './sceneTemplates.js'
import { newDraft } from '../builderModel.js'
import UseSceneMenu from './UseSceneMenu.jsx'
import TemplatesGroup from './TemplatesGroup.jsx'

// Меню «Использовать»: варианты по контексту (нода / модуль ленты / админка), шаблоны
const row = (status = 'published') => ({ id: 'u1', title: 'Кофе', status })

describe('sceneUseOptions', () => {
  it('режим: явный useMode, иначе onApply → node, без → admin', () => {
    expect(sceneUseMode({ onApply: () => {}, useMode: 'module' })).toBe('module')
    expect(sceneUseMode({ onApply: () => {} })).toBe('node')
    expect(sceneUseMode({ onApply: null })).toBe('admin')
    expect(sceneUseMode({ onApply: null, useMode: 'мусор' })).toBe('admin')
  })

  it('нода и модуль — одно прямое действие; админка — меню', () => {
    const node = sceneUseOptions('node', row())
    expect(node.direct).toBe(true)
    expect(node.items.map(i => i.id)).toEqual(['apply'])
    expect(node.items[0].label).toBe('Применить к ноде')
    const mod = sceneUseOptions('module', row('draft'))
    expect(mod.direct).toBe(true)
    expect(mod.items[0].label).toBe('Привязать к фразе')
    expect(mod.items[0].hint).toMatch(/опубликуется/)
    const admin = sceneUseOptions('admin', row())
    expect(admin.direct).toBe(false)
    expect(admin.items.map(i => i.id)).toEqual(['open', 'copy', 'link', 'copyId', 'copyJson'])
    expect(admin.items.every(i => !i.disabled)).toBe(true)
  })

  it('черновик нельзя привязать к ленте — пункт заблокирован с причиной', () => {
    const link = sceneUseOptions('admin', row('draft')).items.find(i => i.id === 'link')
    expect(link.disabled).toBe(true)
    expect(link.reason).toMatch(/опубликуйте/)
  })
})

describe('UseSceneMenu (разметка)', () => {
  it('прямой режим — одна кнопка «Использовать» с подсказкой действия и «?»', () => {
    const html = renderToStaticMarkup(<UseSceneMenu row={row()} mode="node" onAction={vi.fn()} />)
    expect(html).toContain('>Использовать<')
    expect(html).toContain('title="Сцена уйдёт в ноду урока, окно закроется"')
    expect(html).not.toContain('aria-haspopup')
    expect(html).toContain('htBtn')
  })
  it('админка — кнопка с меню (закрыто по умолчанию)', () => {
    const html = renderToStaticMarkup(<UseSceneMenu row={row()} mode="admin" onAction={vi.fn()} />)
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="menu"')
    expect(USE_IN_LESSON_HINT).toMatch(/Из библиотеки/)
  })
})

describe('шаблоны', () => {
  it('семь демо-сцен (две — из одной реплики, «Кружок Пита» — один кот, «Шаблон» — со словами, «Кит и Мия» — маскоты) и пустая; копия получает свой id', () => {
    const list = templateList()
    expect(list.map(t => t.title)).toEqual(['Про работу', 'Кофе-брейк', 'Одна реплика: Повтори', 'Одна реплика: Ответь коту', 'Кружок Пита', 'Шаблон: закажи еду', 'Кит и Мия: знакомство', 'Пустая сцена'])
    expect(list[7].scene.timeline).toHaveLength(2)
    expect(list[5].note).toContain('слова пользователя')
    expect(list[2].scene.timeline).toHaveLength(1)
    expect(list[4].note).toContain('один кот')
    expect(list[4].scene.characters.b).toBeUndefined()
    expect(Object.values(list[7].scene.slots).every(v => v === null)).toBe(true)
    expect(templateScene(list[0]).title).toBe(list[0].title)
    expect(templateScene(list[0]).id).not.toMatch(/copy/)
    expect(templateScene(list[7]).title).toBe('Новая сцена')
    expect(templateScene(list[7]).id).toBe('novaya-stsena')
  })
  it('подтверждение нужно только при реальных правках', () => {
    expect(needsTemplateConfirm({ dirty: true, scene: newDraft() })).toBe(false)
    expect(needsTemplateConfirm({ dirty: false, scene: { ...newDraft(), title: 'x' } })).toBe(false)
    expect(needsTemplateConfirm({ dirty: true, scene: { ...newDraft(), title: 'x' } })).toBe(true)
  })
  it('разметка группы: восемь строк с «Использовать как основу» и «?»', () => {
    const html = renderToStaticMarkup(<TemplatesGroup draft={{ dirty: false, scene: newDraft(), actions: {} }} setStatus={() => {}} />)
    expect(html.match(/Использовать как основу/g)).toHaveLength(8)
    expect(html).toContain('Шаблоны')
    expect(html).toContain('Кофе-брейк')
  })
})

describe('linesNote — склонение «реплика»', () => {
  it('1 / 2 / 5 / 11 / 21 / 22', () => {
    expect(linesNote(1)).toBe('1 реплика')
    expect(linesNote(2)).toBe('2 реплики')
    expect(linesNote(5)).toBe('5 реплик')
    expect(linesNote(11)).toBe('11 реплик')
    expect(linesNote(21)).toBe('21 реплика')
    expect(linesNote(22)).toBe('22 реплики')
  })
})
