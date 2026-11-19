import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainCrop, cropBetween, moveCrop } from '../src/lib/image-edit.js';

test('crop selection works when dragged backwards', () => {
  assert.deepEqual(cropBetween({ x: 250, y: 100 }, { x: 40, y: 20 }, 300, 120), { x: 40, y: 20, width: 210, height: 80 });
});
test('numeric crop stays inside the rotated image', () => {
  assert.deepEqual(constrainCrop({ x: 100, y: 250, width: 500, height: 500 }, 120, 300), { x: 100, y: 250, width: 20, height: 50 });
  assert.deepEqual(constrainCrop({ x: -1, y: -10, width: 0, height: 0 }, 120, 300), { x: 0, y: 0, width: 1, height: 1 });
});
test('moving a selection preserves dimensions and bounds', () => {
  const rect = { x: 30, y: 20, width: 200, height: 80 };
  assert.deepEqual(moveCrop(rect, { x: 1000, y: -1000 }, 300, 120), { x: 100, y: 0, width: 200, height: 80 });
});
