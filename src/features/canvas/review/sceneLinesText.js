// Реплики сцены одним текстом для окна замечания: «Имя: текст» и под ним перевод (если есть)
const WHO = (scene, who) => scene?.characters?.[who]?.name || (who === 'b' ? 'Кот 2' : 'Кот')

export function sceneLinesText(scene) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  return tl.map(l => `${WHO(scene, l.who)}: ${l.text ?? ''}${l.translation ? `\n   ${l.translation}` : ''}`).join('\n')
}
