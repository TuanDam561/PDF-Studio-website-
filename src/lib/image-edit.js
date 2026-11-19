const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function constrainCrop(rect, width, height) {
  const x = clamp(Math.round(Number(rect.x) || 0), 0, width - 1);
  const y = clamp(Math.round(Number(rect.y) || 0), 0, height - 1);
  return {
    x, y,
    width: clamp(Math.round(Number(rect.width) || 1), 1, width - x),
    height: clamp(Math.round(Number(rect.height) || 1), 1, height - y),
  };
}

export function cropBetween(a, b, width, height) {
  const left = clamp(Math.min(a.x, b.x), 0, width);
  const top = clamp(Math.min(a.y, b.y), 0, height);
  return constrainCrop({ x: left, y: top, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }, width, height);
}

export function moveCrop(rect, delta, width, height) {
  return { ...rect, x: clamp(Math.round(rect.x + delta.x), 0, width - rect.width), y: clamp(Math.round(rect.y + delta.y), 0, height - rect.height) };
}

export function renderImageEdits(source, steps) {
  let canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);
  for (const step of steps) {
    const next = document.createElement('canvas');
    if (step.type === 'crop') {
      const rect = constrainCrop(step.rect, canvas.width, canvas.height);
      next.width = rect.width; next.height = rect.height;
      next.getContext('2d').drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    } else if (step.type === 'rotate') {
      next.width = canvas.height; next.height = canvas.width;
      const context = next.getContext('2d');
      context.translate(next.width / 2, next.height / 2);
      context.rotate(step.direction * Math.PI / 2);
      context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    } else throw new Error('Thao tác chỉnh ảnh không hợp lệ.');
    canvas.width = 0; canvas.height = 0;
    canvas = next;
  }
  return canvas;
}
