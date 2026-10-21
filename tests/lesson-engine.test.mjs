import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCompleteLesson,
  canStartLesson,
  completeLesson,
  completePractice,
  completeQuiz,
  completeTheory,
  ensureLessonProgress,
  enterPractice,
  lessonStatus,
} from '../lesson-engine.mjs';

const curriculum = [{ id: 'cockpit' }, { id: 'controls' }];
function freshProfile() {
  return { xp: 0, completedLessons: [], testResults: {}, lessonProgress: {} };
}

test('theory alone never completes a lesson or awards completion XP', () => {
  const learner = freshProfile();
  completeTheory(learner, 'cockpit');
  const progress = ensureLessonProgress(learner, 'cockpit');
  assert.equal(progress.status, 'quiz');
  assert.equal(progress.theoryViewed, true);
  assert.equal(canCompleteLesson(learner, 'cockpit'), false);
  assert.deepEqual(learner.completedLessons, []);
  assert.equal(learner.xp, 0);
});

test('a failed quiz blocks practice and completion', () => {
  const learner = freshProfile();
  completeTheory(learner, 'cockpit');
  assert.equal(completeQuiz(learner, 'cockpit', 'Cabin', 67, 80), false);
  assert.equal(enterPractice(learner, 'cockpit'), false);
  assert.equal(completePractice(learner, 'cockpit', { isCorrect: true }), false);
  assert.equal(canCompleteLesson(learner, 'cockpit'), false);
  assert.equal(ensureLessonProgress(learner, 'cockpit').status, 'quiz');
  assert.equal(learner.xp, 0);
});

test('passing the quiz without completing practice does not finish the lesson', () => {
  const learner = freshProfile();
  completeTheory(learner, 'cockpit');
  assert.equal(completeQuiz(learner, 'cockpit', 'Cabin', 100, 80), true);
  assert.equal(enterPractice(learner, 'cockpit'), true);
  assert.equal(ensureLessonProgress(learner, 'cockpit').status, 'practice');
  assert.equal(completePractice(learner, 'cockpit', { isCorrect: false }), false);
  assert.equal(canCompleteLesson(learner, 'cockpit'), false);
  assert.deepEqual(learner.completedLessons, []);
  assert.equal(learner.xp, 0);
});

test('only passed theory, quiz, and completed practice mark a lesson complete', () => {
  const learner = freshProfile();
  completeTheory(learner, 'cockpit');
  completeQuiz(learner, 'cockpit', 'Cabin', 100, 80);
  enterPractice(learner, 'cockpit');
  assert.equal(completePractice(learner, 'cockpit', { requiredTasks: ['airspeed', 'altimeter'], completedTasks: ['airspeed'] }), false);
  assert.equal(completePractice(learner, 'cockpit', { requiredTasks: ['airspeed', 'altimeter'], completedTasks: ['airspeed', 'altimeter'] }), true);
  const result = completeLesson(learner, 'cockpit');
  assert.deepEqual(result, { completed: true, awarded: true });
  assert.equal(lessonStatus(curriculum, learner, 'cockpit'), 'completed');
  assert.deepEqual(learner.completedLessons, ['cockpit']);
  assert.equal(learner.xp, 100);
});

test('in-progress lesson stage and quiz data survive a LocalStorage style reload', () => {
  const learner = freshProfile();
  completeTheory(learner, 'cockpit');
  const progress = ensureLessonProgress(learner, 'cockpit');
  progress.quizAttempt = { questionIndex: 1, correct: 1, answered: true, lastCorrect: true, errors: 0 };
  const restored = JSON.parse(JSON.stringify(learner));
  assert.equal(lessonStatus(curriculum, restored, 'cockpit'), 'quiz');
  assert.equal(ensureLessonProgress(restored, 'cockpit').theoryViewed, true);
  assert.deepEqual(ensureLessonProgress(restored, 'cockpit').quizAttempt, progress.quizAttempt);
  assert.equal(restored.xp, 0);
});

test('reopening a completed lesson cannot award the 100 XP completion reward again', () => {
  const learner = freshProfile();
  completeTheory(learner, 'cockpit');
  completeQuiz(learner, 'cockpit', 'Cabin', 100, 80);
  enterPractice(learner, 'cockpit');
  completePractice(learner, 'cockpit', { isCorrect: true });
  assert.equal(completeLesson(learner, 'cockpit').awarded, true);
  assert.equal(learner.xp, 100);
  assert.deepEqual(completeLesson(learner, 'cockpit'), { completed: true, awarded: false });
  assert.equal(learner.xp, 100);
});

test('the next lesson stays locked until its prerequisite is completed', () => {
  const learner = freshProfile();
  assert.equal(lessonStatus(curriculum, learner, 'controls'), 'locked');
  assert.equal(canStartLesson(curriculum, learner, 'controls'), false);
  completeTheory(learner, 'cockpit');
  assert.equal(canStartLesson(curriculum, learner, 'controls'), false);
  completeQuiz(learner, 'cockpit', 'Cabin', 100, 80);
  enterPractice(learner, 'cockpit');
  completePractice(learner, 'cockpit', { isCorrect: true });
  completeLesson(learner, 'cockpit');
  assert.equal(lessonStatus(curriculum, learner, 'controls'), 'theory');
  assert.equal(canStartLesson(curriculum, learner, 'controls'), true);
});
