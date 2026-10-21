import { renderLessons, lessons } from './lessons.js';
import { renderAchievements } from './achievements.js';
import { initializeSimulator } from './simulator.js';

const pageTitles = { home: 'Главная', learning: 'Обучение', simulator: '3D-симулятор', missions: 'Миссии', tests: 'Тесты', profile: 'Мой профиль', achievements: 'Достижения', settings: 'Настройки' };
const storageKey = 'aeropilot-state-v1';
const usersKey = 'aeropilot-demo-users-v1';
const levelSteps = [
  { name: 'Курсант', xp: 0 }, { name: 'Начинающий пилот', xp: 500 }, { name: 'Младший пилот', xp: 1200 },
  { name: 'Опытный курсант', xp: 2500 }, { name: 'Выпускник учебного курса', xp: 5000 },
];
const blankProfile = (user) => ({ nickname: user.nickname, email: user.email, trainingLevel: user.trainingLevel, xp: 0, completedLessons: [], completedMissions: [], completedTests: [], testResults: {}, achievements: [] });
let state;
let users;
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
  const legacyProfile = stored.profiles ? null : { nickname: 'Алексей К.', email: '', trainingLevel: 'Новичок', xp: Number(stored.xp) || 0, completedLessons: [], completedMissions: [], completedTests: [], testResults: {}, achievements: [] };
  state = { theme: stored.theme === 'light' ? 'light' : 'dark', sessionEmail: stored.sessionEmail || '', profiles: stored.profiles || (legacyProfile ? { guest: legacyProfile } : {}) };
  const savedUsers = JSON.parse(localStorage.getItem(usersKey) || '[]');
  users = Array.isArray(savedUsers) ? savedUsers : [];
} catch {
  state = { theme: 'dark', sessionEmail: '', profiles: {} };
  users = [];
}
for (const savedProfile of Object.values(state.profiles)) {
  savedProfile.completedLessons ||= [];
  savedProfile.completedMissions ||= [];
  savedProfile.completedTests ||= [];
  savedProfile.testResults ||= {};
  savedProfile.achievements ||= [];
  savedProfile.completedLessons = [...new Set(savedProfile.completedLessons)];
  savedProfile.completedTests = [...new Set(savedProfile.completedTests)];
}
const saveState = () => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { toast('Не удалось сохранить данные в этом браузере'); } };
const profile = () => state.profiles[state.sessionEmail] || null;
const toast = (message) => {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2800);
};

function applyTheme(theme) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', state.theme === 'light');
  document.querySelector('#theme-toggle').textContent = state.theme === 'dark' ? '☼' : '☾';
  document.querySelectorAll('[data-theme-choice]').forEach((button) => button.classList.toggle('selected', button.dataset.themeChoice === state.theme));
  saveState();
}

function navigate(page) {
  if (!pageTitles[page]) return;
  document.querySelectorAll('.page').forEach((element) => element.classList.toggle('active', element.id === `page-${page}`));
  document.querySelectorAll('.nav-link').forEach((element) => element.classList.toggle('active', element.dataset.page === page));
  document.querySelector('#breadcrumb-title').textContent = pageTitles[page];
  document.querySelector('#sidebar').classList.remove('open');
  history.replaceState(null, '', `#${page}`);
  if (page === 'simulator' && !window.aeroSimulator) window.aeroSimulator = initializeSimulator(document.querySelector('#simulator-canvas'));
  if (page === 'profile') renderProfile();
  if (page === 'tests') {
    const completed = profile()?.completedTests.includes('basic-heading') || false;
    document.querySelectorAll('[data-answer]').forEach((button) => { button.disabled = completed; });
    document.querySelector('#test-feedback').textContent = completed ? 'Этот вопрос уже пройден.' : '';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function currentLevel(xp) {
  let index = 0;
  levelSteps.forEach((step, i) => { if (xp >= step.xp) index = i; });
  return { ...levelSteps[index], next: levelSteps[index + 1] || null, index: index + 1 };
}

function refreshDashboard() {
  const current = profile() || state.profiles.guest || null;
  const xp = current?.xp ?? 0;
  const completedCount = current?.completedLessons?.length ?? 0;
  const progress = Math.min(100, Math.round(completedCount / lessons.length * 100));
  document.querySelector('#learning-progress-label').textContent = `${completedCount} из ${lessons.length} уроков`;
  document.querySelector('#learning-progress-bar').style.width = `${progress}%`;
  const level = currentLevel(xp);
  document.querySelector('#xp-number').textContent = xp;
  document.querySelector('#progress-number').textContent = progress;
  document.querySelector('#progress-bar').style.width = `${progress}%`;
  document.querySelector('.xp-track i').style.width = `${level.next ? Math.min(100, (xp - level.xp) / (level.next.xp - level.xp) * 100) : 100}%`;
  document.querySelector('.stat-card:nth-child(2) .positive').textContent = level.next ? `До уровня ${level.index + 1}: ${level.next.xp - xp} XP` : 'Максимальный уровень';
  document.querySelector('.stat-card:nth-child(2) .stat-foot span:first-child').textContent = `Уровень ${level.index}`;
  document.querySelector('.stat-card:nth-child(2) .stat-foot span:last-child').textContent = level.next ? `${level.next.xp} XP` : 'MAX';
  const greeting = current?.nickname || 'будущий пилот';
  document.querySelector('#welcome-title').innerHTML = `Доброе утро, ${escapeHtml(greeting)} <span class="wave">✦</span>`;
  const earned = current?.achievements || [];
  document.querySelector('#nav-achievement-count').textContent = earned.length;
  renderAchievements(document.querySelector('#recent-achievements'), { recent: true, earnedIds: earned });
  renderAchievements(document.querySelector('#all-achievements'), { earnedIds: earned });
  renderLessons(document.querySelector('#course-grid'), { onStart: startLesson, completedIds: current?.completedLessons || [] });
  renderLessons(document.querySelector('#all-course-grid'), { onStart: startLesson, completedIds: current?.completedLessons || [] });
  const missionButton = document.querySelector('#complete-mission');
  const missionDone = current?.completedMissions.includes('preflight-check') || false;
  missionButton.disabled = missionDone;
  missionButton.textContent = missionDone ? 'Задание выполнено ✓' : 'Отметить выполнение · +50 XP';
}

function renderProfile() {
  const current = profile();
  document.querySelector('#signed-out-panel').classList.toggle('hidden', Boolean(current));
  document.querySelector('#signed-in-panel').classList.toggle('hidden', !current);
  if (!current) {
    document.querySelector('#sidebar .avatar').textContent = 'АП';
    document.querySelector('#sidebar .user-mini b').textContent = 'Гость';
    document.querySelector('#sidebar .user-mini small').textContent = 'Войди в профиль';
    document.querySelector('.top-avatar').textContent = 'АП';
    return;
  }
  const level = currentLevel(current.xp);
  const progress = Math.min(100, Math.round(current.completedLessons.length / lessons.length * 100));
  const initials = current.nickname.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase('ru');
  document.querySelector('#profile-avatar').textContent = initials;
  document.querySelector('#sidebar .avatar').textContent = initials;
  document.querySelector('#sidebar .user-mini b').textContent = current.nickname;
  document.querySelector('#sidebar .user-mini small').textContent = level.name;
  document.querySelector('.top-avatar').textContent = initials;
  document.querySelector('#profile-nickname').textContent = current.nickname;
  document.querySelector('#profile-level').textContent = level.name;
  document.querySelector('#profile-next-level').textContent = level.next ? `Следующий уровень: ${level.next.name} · ${level.next.xp} XP` : 'Достигнут максимальный уровень';
  document.querySelector('#profile-training').textContent = current.trainingLevel;
  document.querySelector('#profile-email').textContent = current.email.toLocaleUpperCase('ru');
  document.querySelector('#profile-xp').textContent = `${current.xp} XP`;
  document.querySelector('#profile-progress').textContent = progress;
  document.querySelector('#profile-progress-bar').style.width = `${progress}%`;
  document.querySelector('#profile-lessons').textContent = current.completedLessons.length;
  document.querySelector('#profile-missions').textContent = current.completedMissions.length;
  const completedNames = current.completedLessons.map((id) => lessons.find((lesson) => lesson.id === id)?.title).filter(Boolean);
  document.querySelector('#profile-completed-list').innerHTML = completedNames.length ? completedNames.map((name) => `<div class="detail-row"><span>✓ ${escapeHtml(name)}</span><b>Пройден</b></div>`).join('') : '<span class="detail-empty">Пока нет пройденных уроков</span>';
  const missions = { 'preflight-check': 'Предполётная проверка' };
  document.querySelector('#profile-mission-list').innerHTML = current.completedMissions.length ? current.completedMissions.map((id) => `<div class="detail-row"><span>✓ ${escapeHtml(missions[id] || id)}</span><b>Выполнена</b></div>`).join('') : '<span class="detail-empty">Пока нет выполненных миссий</span>';
  const tests = Object.entries(current.testResults || {});
  document.querySelector('#profile-test-results').innerHTML = tests.length ? tests.map(([name, result]) => `<div class="detail-row"><span>${escapeHtml(name)}</span><b>${result}%</b></div>`).join('') : '<span class="detail-empty">Пока нет результатов тестов</span>';
  const earned = current.achievements || [];
  const names = { 'first-steps': 'Первые шаги', 'three-lessons': 'Первый вылет', 'streak-seven': 'Небо зовёт', 'radio-ready': 'На связи', 'navigator': 'Штурман', 'first-test': 'Проверка пройдена', 'mission-one': 'Первое задание' };
  document.querySelector('#profile-achievements').innerHTML = earned.length ? earned.map((id) => `<div class="detail-row"><span>✦ ${escapeHtml(names[id] || id)}</span><b>Получено</b></div>`).join('') : '<span class="detail-empty">Здесь появятся твои награды</span>';
  const best = tests.length ? Math.max(...tests.map(([, value]) => value)) : null;
  document.querySelector('#best-test').textContent = best === null ? '—' : `${best}%`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function addAchievement(id) {
  const current = profile();
  if (!current || current.achievements.includes(id)) return;
  current.achievements.push(id);
}

function awardXp(amount, label, uniqueId, collection) {
  const current = profile();
  if (!current) { toast('Войди или создай профиль, чтобы сохранять награды'); navigate('profile'); return false; }
  if (current[collection].includes(uniqueId)) { toast('Это задание уже отмечено как выполненное'); return false; }
  current[collection].push(uniqueId);
  current.xp += amount;
  if (collection === 'completedLessons') addAchievement('first-steps');
  if (current.completedLessons.length >= 3) addAchievement('three-lessons');
  if (collection === 'completedTests') addAchievement('first-test');
  if (collection === 'completedMissions') addAchievement('mission-one');
  saveState();
  refreshDashboard();
  renderProfile();
  toast(`${label}: +${amount} XP`);
  return true;
}

let lessonSession = null;
const lessonStepNames = ['ТЕОРИЯ', 'ИНТЕРАКТИВНАЯ ПРАКТИКА', 'ТЕСТ', 'РЕЗУЛЬТАТ'];

function startLesson(lesson, locked = false) {
  if (!lesson) return;
  if (locked) { toast('Сначала заверши предыдущий урок'); return; }
  if (!profile()) { toast('Сначала создай профиль курсанта'); navigate('profile'); return; }
  lessonSession = { lesson, step: 'theory', questionIndex: 0, correct: 0, answered: false, practiceCorrect: false, result: null, practiceOrder: shuffledIndexes(lesson.practice.options.length), quizOrders: lesson.quiz.map((question) => shuffledIndexes(question.options.length)) };
  document.querySelector('#lesson-dialog [data-lesson-title]').textContent = lesson.title;
  renderLessonStep();
  document.querySelector('#lesson-dialog').showModal();
}

function shuffledIndexes(length) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

function renderLessonStep() {
  if (!lessonSession) return;
  const { lesson, step, questionIndex } = lessonSession;
  const stage = document.querySelector('#lesson-stage');
  const dialog = document.querySelector('#lesson-dialog');
  const stepNum = step === 'theory' ? 1 : step === 'practice' ? 2 : step === 'quiz' ? questionIndex + 3 : 6;
  document.querySelector('#lesson-step-count').textContent = step === 'result' ? 'ГОТОВО' : `${stepNum} / 5`;
  document.querySelector('#lesson-overall-progress').style.width = step === 'result' ? '100%' : `${stepNum / 5 * 100}%`;
  document.querySelector('#lesson-step-label').textContent = `${lesson.title.toLocaleUpperCase('ru')} · ${lessonStepNames[step === 'theory' ? 0 : step === 'practice' ? 1 : step === 'quiz' ? 2 : 3]}`;

  if (step === 'theory') {
    stage.innerHTML = `<div class="lesson-scroll"><div class="lesson-intro"><span class="course-icon ${lesson.tone}">${lesson.icon}</span><div><span class="eyebrow">ТЕОРИЯ</span><p>Разберись в теме простыми шагами. Затем попробуй применить знания.</p></div></div><div class="lesson-reading">${lesson.theory.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</div><div class="lesson-diagram"><div class="diagram-title">СХЕМА · ${escapeHtml(lesson.title.toLocaleUpperCase('ru'))}</div><div class="diagram-grid">${lesson.diagram.map((item, index) => `<article class="diagram-item" style="--item-order:${index}"><span>${escapeHtml(item.icon)}</span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.text)}</small></article>`).join('')}</div></div><div class="lesson-safety-note">Учебный материал для знакомства с темой. Практические полёты выполняй только с инструктором и по руководству конкретного самолёта.</div><button class="button-primary lesson-next" data-lesson-next="practice">К практике <span>→</span></button></div>`;
    return;
  }

  if (step === 'practice') {
    const practiceFeedback = lessonSession.practiceChoice === undefined ? '' : `<div class="answer-explanation ${lessonSession.practiceCorrect ? 'is-correct' : 'is-wrong'}" id="practice-explanation" aria-live="polite"><b>${lessonSession.practiceCorrect ? 'Именно так.' : `Неверно. Правильный вариант: ${escapeHtml(lesson.practice.options[lesson.practice.answer])}`}</b><p>${escapeHtml(lesson.practice.explanation)}</p></div>`;
    stage.innerHTML = `<div class="lesson-scroll"><span class="pill-blue">ПОПРОБУЙ САМ</span><h3 class="lesson-prompt">${escapeHtml(lesson.practice.prompt)}</h3><div class="practice-options">${lessonSession.practiceOrder.map((index) => lesson.practice.options[index]).map((option, shownIndex) => { const originalIndex = lessonSession.practiceOrder[shownIndex]; return `<button class="practice-option ${lessonSession.practiceChoice === originalIndex ? (lessonSession.practiceCorrect ? 'selected-correct' : 'selected-wrong') : ''}" data-practice-answer="${originalIndex}" ${lessonSession.practiceCorrect ? 'disabled' : ''}>${escapeHtml(option)}</button>`; }).join('')}</div>${practiceFeedback}<button class="button-primary lesson-next" data-lesson-next="quiz" ${lessonSession.practiceCorrect ? '' : 'disabled'}>Перейти к тесту <span>→</span></button></div>`;
    return;
  }

  if (step === 'quiz') {
    const question = lesson.quiz[questionIndex];
    const order = lessonSession.quizOrders[questionIndex];
    const feedback = lessonSession.answered
      ? `<div class="answer-explanation ${lessonSession.lastCorrect ? 'is-correct' : 'is-wrong'}"><b>${lessonSession.lastCorrect ? 'Верно!' : `Неверно. Правильный ответ: ${escapeHtml(question.options[question.answer])}`}</b><p>${escapeHtml(question.explanation)}</p></div><button class="button-primary lesson-next" data-quiz-next>${questionIndex < lesson.quiz.length - 1 ? 'Следующий вопрос' : 'Показать результат'} <span>→</span></button>`
      : '';
    stage.innerHTML = `<div class="lesson-scroll"><div class="quiz-progress"><span>ВОПРОС ${questionIndex + 1} ИЗ ${lesson.quiz.length}</span><span>${lessonSession.correct} верно</span></div><h3 class="lesson-prompt">${escapeHtml(question.question)}</h3><div class="practice-options quiz-options">${order.map((index) => `<button class="practice-option" data-lesson-answer="${index}" ${lessonSession.answered ? 'disabled' : ''}>${escapeHtml(question.options[index])}</button>`).join('')}</div>${feedback}</div>`;
    return;
  }

  const { result } = lessonSession;
  const recommendation = result.percent >= 80 ? 'Отличный результат. Переходи дальше и возвращайся к уроку для повторения.' : result.passed ? 'Хорошая работа. Перед следующим уроком повтори вопросы, в которых ошибся.' : 'Повтори теорию и практическую схему, затем попробуй тест ещё раз. Для завершения нужно не менее 60%.';
  stage.innerHTML = `<div class="lesson-result ${result.passed ? 'passed' : 'retry'}"><div class="result-medal">${result.passed ? '✦' : '↻'}</div><span class="eyebrow">${result.passed ? 'УРОК ЗАВЕРШЁН' : 'НУЖНА ЕЩЁ ОДНА ПОПЫТКА'}</span><h3>${result.passed ? 'Отличный полёт!' : 'Продолжай тренировку'}</h3><div class="result-score"><strong>${result.correct}</strong><span>из ${lesson.quiz.length} правильных</span><b>${result.percent}%</b></div><p>${escapeHtml(recommendation)}</p><div class="result-rewards">${result.lessonReward ? '<span>Урок завершён · +100 XP</span>' : '<span>Награда за завершение уже получена</span>'}<span>Верные ответы · XP начисляются один раз</span></div><div class="result-actions">${result.passed ? '<button class="button-secondary" data-close-lesson>К списку уроков</button>' : '<button class="button-secondary" data-retry-quiz>Повторить тест</button><button class="button-secondary" data-close-lesson>Закрыть</button>'}</div></div>`;
}

function finishLesson() {
  const current = profile();
  const lesson = lessonSession.lesson;
  const correct = lessonSession.correct;
  const percent = Math.round(correct / lesson.quiz.length * 100);
  const passed = percent >= 60;
  const previousBest = current.testResults[lesson.title] || 0;
  current.testResults[lesson.title] = Math.max(previousBest, percent);
  let lessonReward = false;
  if (passed && !current.completedLessons.includes(lesson.id)) {
    lessonReward = awardXp(100, `Урок «${lesson.title}» завершён`, lesson.id, 'completedLessons');
  } else {
    if (current.completedLessons.length >= 3) addAchievement('three-lessons');
    saveState();
    refreshDashboard();
    renderProfile();
  }
  lessonSession.step = 'result';
  lessonSession.result = { correct, percent, passed, lessonReward };
  renderLessonStep();
}

function showAuthTab(tab) {
  const register = tab === 'register';
  document.querySelector('#login-form').classList.toggle('hidden', register);
  document.querySelector('#register-form').classList.toggle('hidden', !register);
  document.querySelectorAll('[data-auth-tab]').forEach((button) => button.classList.toggle('selected', button.dataset.authTab === tab));
}

async function passwordHash(password, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('Для демо-входа открой сайт через localhost в современном браузере.');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

document.querySelector('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#register-message');
  message.textContent = '';
  const data = new FormData(form);
  const nickname = String(data.get('nickname') || '').trim();
  const email = String(data.get('email') || '').trim().toLowerCase();
  const password = String(data.get('password') || '');
  const trainingLevel = String(data.get('trainingLevel') || 'Новичок');
  if (nickname.length < 2) { message.textContent = 'Укажи имя или никнейм (минимум 2 символа).'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { message.textContent = 'Проверь формат электронной почты.'; return; }
  if (password.length < 8) { message.textContent = 'Пароль должен содержать не менее 8 символов.'; return; }
  if (users.some((user) => user.email === email)) { message.textContent = 'Этот адрес уже зарегистрирован. Попробуй войти.'; return; }
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltText = [...salt].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    users.push({ email, salt: saltText, hash: await passwordHash(password, saltText), nickname, trainingLevel });
    localStorage.setItem(usersKey, JSON.stringify(users));
    state.profiles[email] = blankProfile({ email, nickname, trainingLevel });
    state.sessionEmail = email;
    saveState();
    form.reset();
    refreshDashboard(); renderProfile();
    toast('Профиль курсанта создан');
  } catch (error) { message.textContent = error.message || 'Не получилось создать профиль. Попробуй ещё раз.'; }
});

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#login-message');
  message.textContent = '';
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim().toLowerCase();
  const password = String(data.get('password') || '');
  const user = users.find((item) => item.email === email);
  if (!user) { message.textContent = 'Профиль с такой почтой не найден.'; return; }
  try {
    const hash = await passwordHash(password, user.salt);
    if (hash !== user.hash) { message.textContent = 'Неверный пароль. Проверь данные и попробуй снова.'; return; }
    state.profiles[email] ||= blankProfile(user);
    state.sessionEmail = email;
    saveState();
    form.reset();
    refreshDashboard(); renderProfile();
    toast(`С возвращением, ${user.nickname}!`);
  } catch (error) { message.textContent = error.message || 'Не удалось выполнить вход.'; }
});

document.addEventListener('click', (event) => {
  const navButton = event.target.closest('[data-page]');
  if (navButton) navigate(navButton.dataset.page);
  if (event.target.closest('#theme-toggle')) applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  const themeChoice = event.target.closest('[data-theme-choice]');
  if (themeChoice) applyTheme(themeChoice.dataset.themeChoice);
  if (event.target.closest('[data-action="start-lesson"]')) navigate('learning');
  const tab = event.target.closest('[data-auth-tab]');
  if (tab) showAuthTab(tab.dataset.authTab);
  if (event.target.closest('#logout-button')) { state.sessionEmail = ''; saveState(); renderProfile(); refreshDashboard(); toast('Ты вышел из профиля'); }
  if (event.target.closest('#reset-progress-button')) {
    if (!confirm('Сбросить XP, уроки, миссии, результаты тестов и достижения? Это действие нельзя отменить.')) return;
    const currentUser = users.find((user) => user.email === state.sessionEmail);
    if (!currentUser) { toast('Не удалось найти учётную запись для этого профиля'); return; }
    state.profiles[state.sessionEmail] = blankProfile(currentUser);
    saveState(); refreshDashboard(); renderProfile(); toast('Игровой прогресс сброшен');
  }
  const answer = event.target.closest('[data-answer]');
  if (answer) {
    const current = profile();
    const feedback = document.querySelector('#test-feedback');
    if (!current) { feedback.textContent = 'Создай профиль, чтобы записать результат теста.'; navigate('profile'); return; }
    if (current.completedTests.includes('basic-heading')) { feedback.textContent = 'Этот вопрос уже пройден. XP за ответ уже начислен.'; return; }
    if (Number(answer.dataset.answer) === 1) {
      current.testResults['Основы полёта'] = 100;
      awardXp(20, 'Правильный ответ', 'basic-heading', 'completedTests');
      feedback.textContent = 'Верно! Курс — направление продольной оси самолёта относительно севера.';
      document.querySelectorAll('[data-answer]').forEach((button) => { button.disabled = true; });
    } else { feedback.textContent = 'Пока неверно. Подсказка: это направление, выраженное в градусах.'; }
  }
  const practiceAnswer = event.target.closest('[data-practice-answer]');
  if (practiceAnswer && lessonSession?.step === 'practice') {
    const selected = Number(practiceAnswer.dataset.practiceAnswer);
    lessonSession.practiceChoice = selected;
    lessonSession.practiceCorrect = selected === lessonSession.lesson.practice.answer;
    renderLessonStep();
  }
  if (event.target.closest('[data-lesson-next="practice"]') && lessonSession) {
    lessonSession.step = 'practice';
    renderLessonStep();
  }
  if (event.target.closest('[data-lesson-next="quiz"]') && lessonSession?.practiceCorrect) {
    lessonSession.step = 'quiz';
    lessonSession.questionIndex = 0;
    renderLessonStep();
  }
  const lessonAnswer = event.target.closest('[data-lesson-answer]');
  if (lessonAnswer && lessonSession?.step === 'quiz' && !lessonSession.answered) {
    const question = lessonSession.lesson.quiz[lessonSession.questionIndex];
    lessonSession.lastCorrect = Number(lessonAnswer.dataset.lessonAnswer) === question.answer;
    lessonSession.answered = true;
    if (lessonSession.lastCorrect) {
      lessonSession.correct += 1;
      awardXp(20, 'Верный ответ', `lesson-question:${lessonSession.lesson.id}:${lessonSession.questionIndex}`, 'completedTests');
    }
    renderLessonStep();
  }
  if (event.target.closest('[data-quiz-next]') && lessonSession?.step === 'quiz') {
    if (lessonSession.questionIndex < lessonSession.lesson.quiz.length - 1) {
      lessonSession.questionIndex += 1;
      lessonSession.answered = false;
      lessonSession.lastCorrect = false;
      renderLessonStep();
    } else finishLesson();
  }
  if (event.target.closest('[data-retry-quiz]') && lessonSession) {
    lessonSession.step = 'quiz'; lessonSession.questionIndex = 0; lessonSession.correct = 0; lessonSession.answered = false; lessonSession.lastCorrect = false; renderLessonStep();
  }
  if (event.target.closest('[data-close-lesson]')) document.querySelector('#lesson-dialog').close();
  if (event.target.closest('#lesson-close')) document.querySelector('#lesson-dialog').close();
  if (event.target.closest('#complete-mission')) {
    awardXp(50, 'Дополнительное задание выполнено', 'preflight-check', 'completedMissions');
    const button = document.querySelector('#complete-mission');
    if (profile()?.completedMissions.includes('preflight-check')) button.disabled = true;
    button.textContent = button.disabled ? 'Задание выполнено ✓' : 'Отметить выполнение · +50 XP';
  }
});

document.querySelector('#menu-toggle').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelector('#sidebar').classList.remove('open'); });

renderLessons(document.querySelector('#course-grid'), { onStart: startLesson });
renderLessons(document.querySelector('#all-course-grid'), { onStart: startLesson });
document.querySelector('#complete-mission').addEventListener('click', (event) => {
  const current = profile();
  if (current?.completedMissions.includes('preflight-check')) { event.currentTarget.disabled = true; event.currentTarget.textContent = 'Задание выполнено ✓'; }
});
document.querySelector('#lesson-dialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
applyTheme(state.theme);
renderProfile();
refreshDashboard();
const initialPage = location.hash.slice(1);
if (pageTitles[initialPage]) navigate(initialPage);
