export const achievements = [
  { id: 'first-steps', title: 'Первые шаги', description: 'Заверши свой первый урок', icon: '✦' },
  { id: 'three-lessons', title: 'Первый вылет', description: 'Заверши 3 урока', icon: '✈', unlocked: false },
  { id: 'streak-seven', title: 'Небо зовёт', description: 'Занимайся 7 дней подряд', icon: '♨', unlocked: false },
  { id: 'radio-ready', title: 'На связи', description: 'Пройди курс радиообмена', icon: '⌁', unlocked: false },
  { id: 'navigator', title: 'Штурман', description: 'Заверши курс навигации', icon: '⌖', unlocked: false },
  { id: 'first-test', title: 'Проверка пройдена', description: 'Дай правильный ответ в тесте', icon: '✓' },
  { id: 'mission-one', title: 'Первое задание', description: 'Выполни дополнительную миссию', icon: '⚑' },
];

export function renderAchievements(container, { recent = false, earnedIds = [] } = {}) {
  if (!container) return;
  const list = recent ? achievements.filter((item) => earnedIds.includes(item.id)).slice(-2).reverse() : achievements;
  if (recent && !list.length) { container.innerHTML = '<span class="detail-empty">Первые награды появятся после завершения урока</span>'; return; }
  container.innerHTML = list.map((item) => {
    const unlocked = earnedIds.includes(item.id);
    return recent
    ? `<div class="achievement-item"><span class="achievement-medal">${item.icon}</span><span><b>${item.title}</b><small>${item.description}</small></span></div>`
    : `<article class="achievement-full ${unlocked ? '' : 'locked'}"><span class="achievement-medal">${item.icon}</span><span><b>${item.title}</b><small>${unlocked ? 'Получено · ' : ''}${item.description}</small></span></article>`;
  }).join('');
}
