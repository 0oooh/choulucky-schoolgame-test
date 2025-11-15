export class ScriptPlayer {
  constructor({ participants, scriptFactory, onSpeak, gemini, topicPrompt }) {
    this.participants = participants;
    this.scriptFactory = scriptFactory;
    this.onSpeak = onSpeak;
    this.topicPrompt = topicPrompt;
    this.gemini = gemini;
    this.script = [];
    this.index = 0;
    this.cooldown = 1;
    this.loading = false;
  }

  start() {
    this.script = this.scriptFactory();
    this.index = 0;
    this.cooldown = 0.2;
  }

  async fetchNewScript() {
    if (!this.gemini?.active || this.loading) return;
    this.loading = true;
    const fresh = await this.gemini.generateGroupScript(this.topicPrompt);
    if (fresh && fresh.length) {
      this.script = fresh;
      this.index = 0;
    } else {
      this.script = this.scriptFactory();
      this.index = 0;
    }
    this.loading = false;
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (!this.script || this.script.length === 0) {
      this.script = this.scriptFactory();
      this.index = 0;
    }
    if (this.index >= this.script.length) {
      this.fetchNewScript();
      this.cooldown = 2.5;
      return;
    }
    const line = this.script[this.index++];
    const npc =
      this.participants.find(
        (p) =>
          line.speaker === p.name ||
          line.speaker?.startsWith(p.name) ||
          p.name.startsWith(line.speaker)
      ) || this.participants[this.index % this.participants.length];
    if (npc) {
      this.onSpeak(npc, line.text);
    }
    this.cooldown = Math.min(Math.max(line.text.length / 30, 2.2), 5);
  }
}
