const DIRECTION_ROWS = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

const imageCache = new Map();

const requestImage = (src) => {
  if (imageCache.has(src)) return imageCache.get(src);
  const record = {
    image: new Image(),
    loaded: false,
    listeners: new Set(),
  };
  record.image.onload = () => {
    record.loaded = true;
    record.listeners.forEach((listener) => listener(record));
    record.listeners.clear();
  };
  record.image.src = src;
  imageCache.set(src, record);
  return record;
};

export class SpriteRenderer {
  constructor({ src, columns = 4, rows = 4, fps = 8 }) {
    this.src = src;
    this.columns = columns;
    this.rows = rows;
    this.fps = fps;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.loaded = false;
    this.image = null;
    const record = requestImage(src);
    if (record.loaded) {
      this.attach(record);
    } else {
      record.listeners.add((loadedRecord) => this.attach(loadedRecord));
    }
  }

  attach(record) {
    this.image = record.image;
    this.loaded = true;
    this.frameWidth = this.image.width / this.columns;
    this.frameHeight = this.image.height / this.rows;
  }

  update(dt, moving) {
    if (!this.loaded) return;
    if (!moving) {
      this.frameIndex = 0;
      this.elapsed = 0;
      return;
    }
    this.elapsed += dt;
    const frameDuration = 1 / this.fps;
    if (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frameIndex = (this.frameIndex + 1) % this.columns;
    }
  }

  draw(ctx, position, direction = 'down') {
    if (!this.loaded) return;
    const row = DIRECTION_ROWS[direction] ?? DIRECTION_ROWS.down;
    const sx = this.frameIndex * this.frameWidth;
    const sy = row * this.frameHeight;
    const dx = position.x - this.frameWidth / 2;
    const dy = position.y - this.frameHeight + 10;
    ctx.drawImage(
      this.image,
      sx,
      sy,
      this.frameWidth,
      this.frameHeight,
      dx,
      dy,
      this.frameWidth,
      this.frameHeight
    );
  }
}
