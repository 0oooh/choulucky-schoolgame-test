import { HEARING_RINGS, MODES } from '../core/constants.js';
import { distance } from '../core/utils.js';

const CHAR_PER_SECOND = 42;

export class DialogueManager {
  constructor({ speechLayer, gemini }) {
    this.speechLayer = speechLayer;
    this.gemini = gemini;
    this.channels = new Map();
    this.player = null;
    this.mode = MODES.DAY;
  }

  reset() {
    this.channels.clear();
    this.speechLayer?.clear();
  }

  bindPlayer(player) {
    this.player = player;
  }

  setMode(mode) {
    this.mode = mode;
    this.channels.forEach((state) => {
      state.tone = mode === MODES.NIGHT ? 'night' : 'day';
    });
  }

  ensureState(id) {
    if (!this.channels.has(id)) {
      this.channels.set(id, {
        fullText: '',
        progress: 0,
        visible: false,
        tone: this.mode === MODES.NIGHT ? 'night' : 'day',
        hold: 0,
        affinity: 0,
      });
    }
    return this.channels.get(id);
  }

  speak(entity, text, options = {}) {
    const state = this.ensureState(entity.id);
    state.fullText = text;
    state.progress = 0;
    state.visible = true;
    state.hold = options.hold ?? 2.5;
    state.tone = options.tone || state.tone;
    state.affinity = entity.affinity || 0;
    state.speed = options.speed ?? CHAR_PER_SECOND;
    state.onComplete = options.onComplete;
  }

  hide(id) {
    const state = this.channels.get(id);
    if (state) {
      state.visible = false;
      this.speechLayer.remove(id);
    }
  }

  async askLLM(npc, npcPrompt, text) {
    if (!text.trim()) return null;
    const reply = await this.gemini.chat({ npcPrompt, userText: text });
    return reply;
  }

  calcClarity(entity) {
    if (!this.player) return 1;
    const d = distance(this.player.position, entity.position);
    if (d <= HEARING_RINGS[0]) return 1;
    if (d <= HEARING_RINGS[1]) return 0.75;
    if (d <= HEARING_RINGS[2]) return 0.5;
    if (d <= HEARING_RINGS[3]) return 0.25;
    return 0.1;
  }

  applyNoise(text, clarity) {
    if (clarity >= 0.95) return text;
    const ratio = clarity <= 0.25 ? 3 : clarity <= 0.5 ? 4 : 6;
    return text
      .split(' ')
      .map((word, index) => (index % ratio === 0 ? '...' : word))
      .join(' ');
  }

  update(dt, entitiesById) {
    if (!this.speechLayer) return;
    this.channels.forEach((state, id) => {
      if (!state.visible) return;
      state.progress += (state.speed || CHAR_PER_SECOND) * dt;
      const length = Math.floor(state.progress);
      const displayText = state.fullText.slice(0, length);
      if (displayText.length >= state.fullText.length) {
        state.hold -= dt;
        if (state.hold <= 0) {
          state.visible = false;
          if (typeof state.onComplete === 'function') state.onComplete();
        }
      }
      const entity = entitiesById.get(id);
      if (!entity) return;
      const clarity = this.calcClarity(entity);
      const noisyText = this.applyNoise(displayText || state.fullText, clarity);
      this.speechLayer.update({
        id,
        text: noisyText,
        x: entity.position.x,
        y: entity.position.y - entity.radius - 40,
        affinity: Math.min(entity.affinity || 0, 1),
        tone: state.tone,
        visible: state.visible,
      });
    });
  }
}
