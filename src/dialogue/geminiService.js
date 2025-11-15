import { GEMINI_CONFIG } from '../core/constants.js';

export class GeminiService {
  constructor(config = GEMINI_CONFIG) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  get active() {
    return Boolean(this.apiKey);
  }

  async request(prompt) {
    if (!this.active) return null;
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, topK: 32, candidateCount: 1 },
      }),
    });
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .join('') ?? '';
    return text.trim();
  }

  async chat({ npcPrompt, userText }) {
    try {
      const prompt = `${npcPrompt}\n\n사용자가 이렇게 말했다: "${userText}"\n해당 말투를 지키면서 120자 이내로 답하라.`;
      const text = await this.request(prompt);
      return text || null;
    } catch (error) {
      console.warn('Gemini chat error', error);
      return null;
    }
  }

  async generateGroupScript(topicPrompt) {
    try {
      const prompt = `${topicPrompt}\n\n두 명의 학생이 서로 번갈아 말하는 6개의 대화문을 JSON 배열로 작성해. {"speaker":"이름","text":"내용"} 형식으로만 작성한다.`;
      const text = await this.request(prompt);
      if (!text) return null;
      const jsonStart = text.indexOf('[');
      const jsonEnd = text.lastIndexOf(']');
      if (jsonStart === -1 || jsonEnd === -1) return null;
      const jsonText = text.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonText);
      return parsed;
    } catch (error) {
      console.warn('Gemini script error', error);
      return null;
    }
  }
}
