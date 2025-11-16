const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  f: 'interact',
  D: 'debug',
  '=': 'zoomIn',
  '+': 'zoomIn',
  '-': 'zoomOut',
  '_': 'zoomOut',
  '1': 'spitGum',
  '2': 'graffity',
  '3': 'lieDown',
  '4': 'fire',
};

export class InputManager {
  constructor() {
    this.state = new Map();
    this.listeners = new Map();
    window.addEventListener('keydown', (event) => this.handle(event, true));
    window.addEventListener('keyup', (event) => this.handle(event, false));
  }

  handle(event, isDown) {
    const mapped = KEY_MAP[event.key];
    if (!mapped) return;
    this.state.set(mapped, isDown);
    const list = this.listeners.get(mapped);
    if (list) {
      list.forEach((callback) => callback(isDown));
    }
    event.preventDefault();
  }

  isPressed(name) {
    return this.state.get(name);
  }

  onKey(name, callback) {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name).add(callback);
    return () => this.listeners.get(name)?.delete(callback);
  }
}
