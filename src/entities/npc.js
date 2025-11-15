import { Entity } from './entity.js';
import { NPC_SPEED } from '../core/constants.js';
import { distance, normalize, chance, rand } from '../core/utils.js';

export class NPC extends Entity {
  constructor({ id, name, x, y, role, color, radius = 12, behavior = 'idle' }) {
    super({ id, name, x, y, speed: NPC_SPEED, radius, color });
    this.role = role;
    this.behavior = behavior;
    this.anchor = { x, y };
    this.target = null;
    this.dialogueProfile = role;
    this.wanderCooldown = rand(2, 5);
  }

  setBehavior(behavior) {
    this.behavior = behavior;
  }

  setTarget(target) {
    this.target = target;
  }

  update(dt) {
    if (this.behavior === 'idle') {
      this.velocity.x = 0;
      this.velocity.y = 0;
    } else if (this.behavior === 'wander') {
      this.wanderCooldown -= dt;
      if (!this.target || this.wanderCooldown <= 0) {
        this.target = {
          x: this.anchor.x + rand(-60, 60),
          y: this.anchor.y + rand(-60, 60),
        };
        this.wanderCooldown = rand(3, 6);
      }
      if (this.target) {
        const dist = distance(this.position, this.target);
        if (dist < 8) {
          this.target = null;
          this.velocity.x = 0;
          this.velocity.y = 0;
        } else {
          const dir = normalize(
            this.target.x - this.position.x,
            this.target.y - this.position.y
          );
          this.velocity.x = dir.x * this.speed * 0.6;
          this.velocity.y = dir.y * this.speed * 0.6;
        }
      }
    } else if (this.behavior === 'loop') {
      if (!this.loopNodes || this.loopNodes.length === 0) {
        this.velocity.x = 0;
        this.velocity.y = 0;
      } else {
        const target = this.loopNodes[this.loopIndex];
        const dist = distance(this.position, target);
        if (dist < 12) {
          this.loopIndex = (this.loopIndex + 1) % this.loopNodes.length;
        }
        const dir = normalize(target.x - this.position.x, target.y - this.position.y);
        this.velocity.x = dir.x * this.speed * 0.5;
        this.velocity.y = dir.y * this.speed * 0.5;
      }
    }
    super.update(dt);
  }

  assignLoop(nodes) {
    this.loopNodes = nodes;
    this.loopIndex = 0;
    this.behavior = 'loop';
  }
}
