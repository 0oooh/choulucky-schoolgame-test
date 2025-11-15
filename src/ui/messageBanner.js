export class MessageBanner {
  constructor(node) {
    this.node = node;
    this.hideTimeout = null;
  }

  show(text, duration = 2.5) {
    if (!this.node) return;
    this.node.textContent = text;
    this.node.classList.remove('hidden');
    clearTimeout(this.hideTimeout);
    this.hideTimeout = setTimeout(() => this.hide(), duration * 1000);
  }

  hide() {
    if (!this.node) return;
    this.node.classList.add('hidden');
  }
}
