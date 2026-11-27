import test from 'node:test';
import assert from 'node:assert/strict';
import { photoPrompts, rankPhotoCategories } from '../src/services/photoCategories.js';

test('photo categories use their strongest alias once and retain its wording', () => {
  assert.equal(new Set(photoPrompts).size, photoPrompts.length);
  const ranked = rankPhotoCategories([
    { label: 'outdoor garbage dump', score: 0.2 },
    { label: 'illegal dumping', score: 0.6 },
    { label: 'sewage overflow on a street', score: 0.4 },
    { label: 'unlisted prediction', score: 1 },
  ]);
  assert.equal(ranked[0].entry.category, 'garbage');
  assert.equal(ranked[0].matchedPrompt, 'illegal dumping');
  assert.equal(ranked[0].score, 0.6);
  assert.equal(ranked[1].score, 0.4);
});

test('a text hint breaks a close tie without changing visual confidence', () => {
  const ranked = rankPhotoCategories([
    { label: 'outdoor garbage dump', score: 0.5 },
    { label: 'sewage overflow on a street', score: 0.5 },
  ], 'sewage');
  assert.equal(ranked[0].entry.category, 'sewage');
  assert.equal(ranked[0].score, 0.5);
  assert.equal(ranked[0].adjustedScore, 0.54);
});
