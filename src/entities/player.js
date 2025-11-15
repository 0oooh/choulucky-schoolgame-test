import { Entity } from './entity.js';
import { PLAYER_SPEED } from '../core/constants.js';
import { normalize } from '../core/utils.js';

export class Player extends Entity {
  constructor({ input, x, y, color = '#f8c750' }) {
    super({ id: 'player', name: 'A', x, y, speed: PLAYER_SPEED, radius: 14, color });
    this.input = input;
    this.talkingTo = null;
  }

  update(dt) {
    const dir = { x: 0, y: 0 };
    if (this.input.isPressed('up')) dir.y -= 1;
    if (this.input.isPressed('down')) dir.y += 1;
    if (this.input.isPressed('left')) dir.x -= 1;
    if (this.input.isPressed('right')) dir.x += 1;
    const norm = normalize(dir.x, dir.y);
    this.velocity.x = norm.x * this.speed;
    this.velocity.y = norm.y * this.speed;
    super.update(dt);
  }
}
