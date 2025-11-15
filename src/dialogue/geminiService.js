import { GEMINI_CONFIG } from '../core/constants.js';

export class GeminiService {
  constructor(config = GEMINI_CONFIG) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.lastRequestTime = 0;
    this.minRequestInterval = 5000; // 최소 5초 간격 (분당 12회 제한)
    this.requestQueue = Promise.resolve();
  }

  get active() {
    return Boolean(this.apiKey);
  }

  // 요청을 큐에 넣어서 순차적으로 처리
  async queueRequest(fn) {
    this.requestQueue = this.requestQueue
      .then(() => fn())
      .catch(() => fn()); // 이전 요청 실패해도 다음 요청 처리
    return this.requestQueue;
  }

  // 대기 시간 계산
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`⏱️ Rate limit: waiting ${Math.round(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  async request(prompt, retries = 2) {
    if (!this.active) return null;
    
    return this.queueRequest(async () => {
      await this.waitForRateLimit();
      
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.9, topK: 32, candidateCount: 1 },
            }),
          });
          
          if (response.status === 429) {
            // Rate limit 에러 - 더 오래 대기 후 재시도
            const waitTime = (attempt + 1) * 10000; // 10초, 20초, 30초...
            console.warn(`⚠️ Rate limit hit (429), waiting ${waitTime / 1000}s before retry ${attempt + 1}/${retries}...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          
          if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
          }
          
          const data = await response.json();
          const text =
            data?.candidates?.[0]?.content?.parts
              ?.map((part) => part.text)
              .join('') ?? '';
          return text.trim();
        } catch (error) {
          if (attempt === retries) {
            throw error; // 마지막 시도에서도 실패하면 에러 던지기
          }
          console.warn(`🔄 Request failed, retrying (${attempt + 1}/${retries})...`);
        }
      }
    });
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
