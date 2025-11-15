import { BATTERY_COUNT } from '../core/constants.js';

export class BatteryHud {
  constructor(root) {
    this.root = root;
    this.slots = [];
    this.init();
  }

  init() {
    if (!this.root) return;
    this.root.innerHTML = '';
    for (let i = 0; i < BATTERY_COUNT; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'battery-slot';
      this.root.appendChild(slot);
      this.slots.push(slot);
    }
  }

  reset() {
    this.slots.forEach((slot) => slot.classList.remove('filled'));
  }

  fill(count) {
    this.reset();
    for (let i = 0; i < count; i += 1) {
      this.slots[i]?.classList.add('filled');
    }
  }
}
