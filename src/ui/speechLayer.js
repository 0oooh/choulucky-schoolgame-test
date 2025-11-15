export class SpeechLayer {
  constructor(root) {
    this.root = root;
    this.bubbles = new Map();
  }

  clear() {
    this.bubbles.forEach((bubble) => bubble.remove());
    this.bubbles.clear();
  }

  ensureBubble(id) {
    if (!this.bubbles.has(id)) {
      const div = document.createElement('div');
      div.className = 'speech-bubble';
      div.dataset.tone = 'day';
      this.root.appendChild(div);
      this.bubbles.set(id, div);
    }
    return this.bubbles.get(id);
  }

  remove(id) {
    const node = this.bubbles.get(id);
    if (node?.parentElement) {
      node.parentElement.removeChild(node);
    }
    this.bubbles.delete(id);
  }

  update({ id, text, x, y, affinity = 0, tone = 'day', visible = true }) {
    const bubble = this.ensureBubble(id);
    bubble.dataset.tone = tone;
    bubble.style.setProperty('--affinity', affinity);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    bubble.style.opacity = visible ? 1 : 0;
    bubble.style.visibility = visible ? 'visible' : 'hidden';
    bubble.innerHTML = '';
    const lines = (text || '').split('\n');
    lines.forEach((line) => {
      const span = document.createElement('span');
      span.className = 'message-line';
      span.textContent = line;
      bubble.appendChild(span);
    });
  }
}
