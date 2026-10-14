import { describe, it, expect } from 'vitest'
import { buildPrompt, stripCodeFence } from './aiPrompt.js'
import { isMissingTable, isRightsError } from '../../../shared/api/scenesApi.js'

describe('промпт для нейросети и разбор ответа', () => {
  it('buildPrompt подставляет тему, без темы — плейсхолдер', () => {
    expect(buildPrompt(' кофе ')).toMatch(/на тему: кофе\./)
    expect(buildPrompt('')).toContain('<тема>')
    expect(buildPrompt()).toContain('только JSON')
  })
  it('stripCodeFence снимает ```json … ```', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripCodeFence('Вот:\n```\n{"a":1}\n```\nготово')).toBe('{"a":1}')
    expect(stripCodeFence(' {"a":1} ')).toBe('{"a":1}')
  })
})

describe('scenesApi: распознавание ошибок', () => {
  it('нет таблицы: коды 42P01 / PGRST205 и текст', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable({ code: 'PGRST205', message: 'x' })).toBe(true)
    expect(isMissingTable({ message: "Could not find the table 'public.scenes' in the schema cache" })).toBe(true)
    expect(isMissingTable({ message: 'relation "public.scenes" does not exist' })).toBe(true)
    expect(isMissingTable({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingTable(null)).toBe(false)
  })
  it('нет прав: RLS / 42501', () => {
    expect(isRightsError({ code: '42501' })).toBe(true)
    expect(isRightsError({ message: 'new row violates row-level security policy' })).toBe(true)
    expect(isRightsError({ message: 'network' })).toBe(false)
  })
})
