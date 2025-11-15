import { InputManager } from './core/input.js';
import {
  MODES,
  CONVERSATION_RANGE,
  BATTERY_COUNT,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  HEARING_RINGS,
  CAMERA_ZOOM,
  CAMERA_SMOOTHING,
} from './core/constants.js';
import { SchoolMap } from './world/map.js';
import { Player } from './entities/player.js';
import { NPC } from './entities/npc.js';
import { Guard } from './entities/guard.js';
import { Thief } from './entities/thief.js';
import { Battery } from './entities/battery.js';
import { SpeechLayer } from './ui/speechLayer.js';
import { DialogueManager } from './dialogue/dialogueManager.js';
import { ScriptPlayer } from './dialogue/scriptPlayer.js';
import {
  cdScript,
  efScript,
  teacherLines,
  soloStudents,
  npcPrompts,
  fallbackReply,
} from './dialogue/scriptPools.js';
import { GeminiService } from './dialogue/geminiService.js';
import { MessageBanner } from './ui/messageBanner.js';
import { BatteryHud } from './ui/batteryHud.js';
import { Pathfinder } from './systems/pathfinding.js';
import { renderNightLighting, renderNightOverlay } from './systems/nightLighting.js';
import { hasLineOfSight } from './systems/lineOfSight.js';
import { distance, chance, pickRandom, rand } from './core/utils.js';
import { SpriteRenderer } from './ui/spriteRenderer.js';
import { Camera } from './systems/camera.js';

class GameController {
  constructor({ canvas, speechLayerNode, dialogueForm, dialogueInput, modeSwitch, messageBanner, batteryHud, investigatingAlert, gridToggle, cutsceneContainer, cutsceneVideo, bgmToggle, musicToggle, chaseBgm, dayBgm, nightBgm }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new InputManager();
    this.map = new SchoolMap();
    this.entities = [];
    this.entitiesById = new Map();
    this.randomSpeechTimers = new Map();
    this.groupScripts = [];
    this.batteries = [];
    this.focusedNPC = null;
    this.waitingForResponse = false;
    this.principalGreeted = false;
    this.noiseEvent = null;
    this.pendingReset = null;
    this.collectedBatteries = 0;
    this.autoGreetingCooldown = new Map();
    this.thiefPathTimer = 0;
    this.guardPatrolPath = [];
    this.guardStallTimer = 0;
    this.thiefStallTimer = 0;
    this.guardPatrolPath = [];
    this.debugColliders = false; // 디버그 모드 (D 키로 토글)
    this.showGrid = false; // 그리드 표시 여부
    this.paused = false; // 게임 일시정지 상태
    this.bgmEnabled = true; // 효과음 활성화 여부
    this.musicEnabled = true; // 음악 활성화 여부
    this.wasInOffice = false; // 교장실에 있었는지 추적
    
    // 카메라 시스템
    this.camera = new Camera({ zoom: CAMERA_ZOOM, smoothing: CAMERA_SMOOTHING });
    this.camera.setBaseZoom(CAMERA_ZOOM);

    this.speechLayer = new SpeechLayer(speechLayerNode);
    this.messageBanner = new MessageBanner(messageBanner);
    this.batteryHud = new BatteryHud(batteryHud);
    this.investigatingAlert = investigatingAlert;
    this.cutsceneContainer = cutsceneContainer;
    this.cutsceneVideo = cutsceneVideo;
    this.bgmToggle = bgmToggle;
    this.musicToggle = musicToggle;
    this.chaseBgm = chaseBgm;
    this.dayBgm = dayBgm;
    this.nightBgm = nightBgm;
    this.principalBgm = document.getElementById('principalBgm');
    this.caughtSfx = document.getElementById('caughtSfx');
    this.approachSfx1 = document.getElementById('approachSfx1');
    this.approachSfx2 = document.getElementById('approachSfx2');
    this.lastApproachSfxNpc = null; // 마지막으로 효과음을 재생한 NPC ID

    this.gemini = new GeminiService();
    this.dialogueManager = new DialogueManager({ speechLayer: this.speechLayer, gemini: this.gemini });

    this.dialogueForm = dialogueForm;
    this.dialogueInput = dialogueInput;
    this.modeSwitch = modeSwitch;
    this.gridToggle = gridToggle;
    this.mode = MODES.DAY;

    this.pathfinder = new Pathfinder(this.map);
    this.dayCanvas = document.createElement('canvas');
    this.dayCanvas.width = CANVAS_WIDTH;
    this.dayCanvas.height = CANVAS_HEIGHT;
    this.dayCtx = this.dayCanvas.getContext('2d');
    this.input.onKey('interact', (pressed) => {
      if (pressed) {
        this.handleBatteryCollection();
      }
    });
    
    this.input.onKey('debug', (pressed) => {
      if (pressed) {
        this.debugColliders = !this.debugColliders;
        console.log(`🔧 Debug mode (colliders): ${this.debugColliders ? 'ON' : 'OFF'}`);
      }
    });
    
    this.input.onKey('zoomIn', (pressed) => {
      if (pressed) {
        const newZoom = this.camera.zoom + 0.2;
        this.camera.setZoom(newZoom, true);
        this.camera.setBaseZoom(newZoom);
        console.log(`🔍 Zoom: ${this.camera.zoom.toFixed(1)}x`);
      }
    });
    
    this.input.onKey('zoomOut', (pressed) => {
      if (pressed) {
        const newZoom = this.camera.zoom - 0.2;
        this.camera.setZoom(newZoom, true);
        this.camera.setBaseZoom(newZoom);
        console.log(`🔍 Zoom: ${this.camera.zoom.toFixed(1)}x`);
      }
    });

    this.bindEvents();
    this.setMode(MODES.DAY);
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  bindEvents() {
    this.modeSwitch.addEventListener('change', () => {
      const targetMode = this.modeSwitch.checked ? MODES.NIGHT : MODES.DAY;
      this.setMode(targetMode);
    });

    this.gridToggle.addEventListener('change', () => {
      this.showGrid = this.gridToggle.checked;
      console.log(`🔲 Grid visualization: ${this.showGrid ? 'ON' : 'OFF'}`);
    });

    this.bgmToggle.addEventListener('change', () => {
      this.bgmEnabled = this.bgmToggle.checked;
      console.log(`🎵 효과음: ${this.bgmEnabled ? 'ON' : 'OFF'}`);
      
      // 효과음이 꺼지면 즉시 정지
      if (!this.bgmEnabled) {
        if (this.chaseBgm && !this.chaseBgm.paused) {
          this.chaseBgm.pause();
          this.chaseBgm.currentTime = 0;
        }
        if (this.principalBgm && !this.principalBgm.paused) {
          this.principalBgm.pause();
          this.principalBgm.currentTime = 0;
        }
        if (this.caughtSfx && !this.caughtSfx.paused) {
          this.caughtSfx.pause();
          this.caughtSfx.currentTime = 0;
        }
        if (this.approachSfx1 && !this.approachSfx1.paused) {
          this.approachSfx1.pause();
          this.approachSfx1.currentTime = 0;
        }
        if (this.approachSfx2 && !this.approachSfx2.paused) {
          this.approachSfx2.pause();
          this.approachSfx2.currentTime = 0;
        }
      }
    });

    this.musicToggle.addEventListener('change', () => {
      this.musicEnabled = this.musicToggle.checked;
      console.log(`🎶 음악: ${this.musicEnabled ? 'ON' : 'OFF'}`);
      
      // 음악이 꺼지면 즉시 정지
      if (!this.musicEnabled) {
        if (this.dayBgm && !this.dayBgm.paused) {
          this.dayBgm.pause();
        }
        if (this.nightBgm && !this.nightBgm.paused) {
          this.nightBgm.pause();
        }
      } else {
        // 음악이 켜지면 현재 모드에 맞는 음악 재생
        if (this.mode === MODES.DAY) {
          this.playDayBgm();
        } else if (this.mode === MODES.NIGHT) {
          this.playNightBgm();
        }
      }
    });

    this.dialogueForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleDialogue();
    });
  }

  registerEntity(entity) {
    this.entities.push(entity);
    this.entitiesById.set(entity.id, entity);
    entity.walkChecker = (x, y, radius) => this.map.isWalkableCircle({ x, y }, radius);
    return entity;
  }

  applySprite(entity, type) {
    const src = `./assets/sprites/${type}.png`;
    entity.sprite = new SpriteRenderer({ src });
  }

  setupDayMode() {
    this.batteryHud.reset();
    this.collectedBatteries = 0;
    this.batteries = [];
    this.noiseEvent = null;
    this.guard = null;
    this.thief = null;
    this.wasInOffice = false; // 교장실 상태 초기화

    this.player = new Player({ input: this.input, x: this.map.hallwayRect.x + 160, y: this.map.hallwayRect.y + 120, color: '#4ed37e' });
    this.player.markerColor = '#4ed37e';
    this.registerEntity(this.player);
    this.applySprite(this.player, 'player');
    this.dialogueManager.bindPlayer(this.player);
    this.dialogueManager.bindCamera(this.camera); // 카메라 연결
    this.camera.setTarget(this.player); // 카메라가 플레이어를 따라감
    this.principalGreeted = false;
    
    // 낮 배경음악 재생
    this.playDayBgm();

    // Principal B
    const seat = this.map.getOfficeSeat();
    this.principal = this.registerEntity(
      new NPC({
        id: 'npc-principal',
        name: 'B',
        role: 'principal',
        x: seat.x,
        y: seat.y,
        color: '#b12e48',
        behavior: 'idle',
      })
    );
    this.principal.markerColor = '#d94848';
    this.applySprite(this.principal, 'principal');

    const hallwayMidY = this.map.hallwayRect.y + this.map.hallwayRect.height / 2;
    const leftAnchorX = this.map.hallwayRect.x + 220;
    const rightAnchorX = this.map.hallwayRect.x + this.map.hallwayRect.width - 220;
    const pairSpacing = 26;
    const cdPair = [
      this.registerEntity(new NPC({ id: 'npc-C', name: 'C', role: 'student', x: leftAnchorX, y: hallwayMidY - 20, color: '#f5d76e', behavior: 'idle' })),
      this.registerEntity(
        new NPC({
          id: 'npc-D',
          name: 'D',
          role: 'student',
          x: leftAnchorX + pairSpacing,
          y: hallwayMidY - 14,
          color: '#f5d76e',
          behavior: 'idle',
        })
      ),
    ];
    const efPair = [
      this.registerEntity(new NPC({ id: 'npc-E', name: 'E', role: 'student', x: rightAnchorX, y: hallwayMidY + 20, color: '#f5d76e', behavior: 'idle' })),
      this.registerEntity(
        new NPC({
          id: 'npc-F',
          name: 'F',
          role: 'student',
          x: rightAnchorX + pairSpacing,
          y: hallwayMidY + 26,
          color: '#f5d76e',
          behavior: 'idle',
        })
      ),
    ];
    [...cdPair, ...efPair].forEach((npc) => {
      npc.markerColor = '#f5d76e';
      npc.anchor = { x: npc.position.x, y: npc.position.y };
      this.applySprite(npc, 'student');
    });

    this.groupScripts = [
      new ScriptPlayer({
        participants: cdPair,
        scriptFactory: cdScript,
        onSpeak: (npc, line) => this.dialogueManager.speak(npc, line, { tone: 'day', hold: 3.2 }),
        gemini: this.gemini,
        topicPrompt: '수능 시험의 어려움과 다가오는 크리스마스에 대해 자연스럽게 대화문을 작성해.',
      }),
      new ScriptPlayer({
        participants: efPair,
        scriptFactory: efScript,
        onSpeak: (npc, line) => this.dialogueManager.speak(npc, line, { tone: 'day', hold: 3.2 }),
        gemini: this.gemini,
        topicPrompt: '우왁굳의 배그대잔치 방송과 이세계아이돌의 신곡 Nameless, Be My Light에 대한 긍정적인 대화를 작성해.',
      }),
    ];
    this.groupScripts.forEach((script) => script.start());

    this.classroomNPCs = [];
    this.randomSpeechTimers.clear();

    this.map.classrooms.forEach((room, index) => {
      const teacher = this.registerEntity(
        new NPC({
          id: `teacher-${index}`,
          name: `선생${index + 1}`,
          role: 'teacher',
          x: room.rect.x + room.rect.width / 2,
          y: room.rect.y + 30,
          color: '#ffd365',
          behavior: 'idle',
        })
      );
      teacher.markerColor = '#f5d76e';
      this.applySprite(teacher, 'student');

      for (let s = 0; s < 2; s += 1) {
        const { x, y } = this.map.randomPointInRoom(room, 24);
        const student = this.registerEntity(
          new NPC({
            id: `student-${index}-${s}`,
            name: `학생${index + 1}-${s + 1}`,
            role: 'student',
            x,
            y,
            color: s === 0 ? '#f0a6ca' : '#b7d3f2',
            behavior: 'idle',
          })
        );
        student.markerColor = '#f5d76e';
        this.applySprite(student, 'student');
        this.classroomNPCs.push(student);
      }
      this.classroomNPCs.push(teacher);
    });

    this.dayNPCs = [...cdPair, ...efPair, ...this.classroomNPCs, this.principal];
  }

  setupNightMode() {
    this.batteryHud.reset();
    this.collectedBatteries = 0;
    this.principal = null;
    this.groupScripts = [];
    this.randomSpeechTimers.clear();
    this.guardPatrolPath = [];
    this.guardStallTimer = 0;
    this.thiefStallTimer = 0;
    this.thiefPathTimer = 0;

    this.player = new Player({ input: this.input, x: this.map.hallwayRect.x + 140, y: this.map.hallwayRect.y + 500, color: '#4ed37e' });
    this.player.markerColor = '#4ed37e';
    this.registerEntity(this.player);
    this.applySprite(this.player, 'player');
    this.dialogueManager.bindPlayer(this.player);
    this.dialogueManager.bindCamera(this.camera); // 카메라 연결
    this.camera.setTarget(this.player); // 카메라가 플레이어를 따라감
    
    // 낮 배경음악 정지, 밤 배경음악 재생
    this.stopDayBgm();
    this.playNightBgm();

    // 경비원을 순찰 시작 위치에 배치
    const guardStartX = this.map.hallwayRect.x + 100;
    const guardStartY = this.map.hallwayRect.y + 100;
    this.guard = this.registerEntity(new Guard({ x: guardStartX, y: guardStartY }));
    this.guard.markerColor = '#f5d76e';
    this.applySprite(this.guard, 'guard');
    
    // 순찰 경로 생성 (A* 경로 + action 메타데이터 포함)
    const guardRoute = this.map.buildGuardRoute();
    this.guardPatrolPath = this.buildPatrolPath(guardRoute);
    
    if (!this.guardPatrolPath || this.guardPatrolPath.length === 0) {
      console.error('Failed to build guard patrol path!');
      return;
    }
    
    this.guard.setPatrolPath(this.guardPatrolPath);
    console.log(`Guard patrol initialized with ${this.guardPatrolPath.length} waypoints`);

    this.thief = this.registerEntity(new Thief({ x: this.map.office.x + 30, y: this.map.office.y + this.map.office.height + 80 }));
    this.thief.markerColor = '#f5d76e';
    this.applySprite(this.thief, 'thief');
    this.thiefPathTimer = 0;
    this.scheduleThiefPath(true);

    this.batteries = Array.from({ length: BATTERY_COUNT }, (_, index) => {
      let position = null;
      let attempts = 0;
      const guardRadius = 16; // 경비원 반경과 동일하게 검증
      // walkable한 위치를 찾을 때까지 시도
      while (!position && attempts < 20) {
        const testPos = this.randomWalkPoint();
        if (this.map.isWalkableCircle(testPos, guardRadius)) {
          position = testPos;
        }
        attempts += 1;
      }
      if (!position) {
        console.warn(`Battery ${index} could not find walkable position, using fallback`);
        position = { x: this.map.hallwayRect.x + 200 + index * 100, y: this.map.hallwayRect.y + 200 };
      }
      const battery = new Battery({ id: `battery-${index}`, ...position });
      return battery;
    });

    this.noiseEvent = null;
  }

  randomWalkPoint() {
    const room = pickRandom([...this.map.classrooms, { rect: this.map.office }, { rect: this.map.hallwayRect }]);
    const { x, y } = this.map.randomPointInRoom(room, 40);
    return { x, y };
  }


  renderDayBuffer() {
    if (!this.dayCtx || !this.camera) return;
    this.dayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // day 버퍼에도 카메라 변환 적용
    this.camera.applyTransform(this.dayCtx);
    this.map.render(this.dayCtx, MODES.DAY, this.debugColliders);
    this.camera.resetTransform(this.dayCtx);
  }

  buildPatrolPath(nodes) {
    if (!nodes || nodes.length < 2) return nodes ? nodes.slice() : [];
    
    // 노드 간 A* 경로 생성 (action 속성 유지)
    const path = [];
    
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const from = nodes[i];
      const to = nodes[i + 1];
      
      // 현재 노드가 scan이면 그대로 추가
      if (from.action === 'scan') {
        path.push(from);
        continue;
      }
      
      // 일반 이동이면 A* 경로 생성
      const segment = this.pathfinder.findPath(from, to);
      
      if (segment && segment.length > 0) {
        // 중복 제거
        if (path.length > 0) {
          segment.shift();
        }
        // action 속성 추가
        const segmentWithAction = segment.map(point => ({ ...point, action: 'move' }));
        path.push(...segmentWithAction);
      } else {
        // 경로 찾기 실패시 직접 추가
        console.warn(`Failed to find path between nodes ${i} and ${i + 1}, adding direct`);
        if (path.length === 0) {
          path.push({ ...from, action: from.action || 'move' });
        }
        path.push({ ...to, action: to.action || 'move' });
      }
    }
    
    // 마지막 노드가 scan이면 추가
    const lastNode = nodes[nodes.length - 1];
    if (lastNode && lastNode.action === 'scan') {
      path.push(lastNode);
    }
    
    if (path.length === 0) {
      console.warn('Patrol path building failed entirely');
      return nodes.map(n => ({ ...n, action: n.action || 'move' }));
    }
    
    console.log(`Built patrol path with ${path.length} waypoints`);
    return path;
  }

  scheduleThiefPath(force = false) {
    if (!this.thief) return;
    if (!force && this.thief.hasPath() && this.thiefPathTimer > 0) return;
    let attempts = 0;
    while (attempts < 15) {
      const destination = this.randomWalkPoint();
      // 목적지가 실제로 walkable한지 확인
      if (!this.map.isWalkableCircle(destination, this.thief.radius)) {
        attempts += 1;
        continue;
      }
      const path = this.pathfinder.findPath(this.thief.position, destination);
      if (path.length > 0) {
        this.thief.setPath(path);
        this.thiefPathTimer = rand(6, 12);
        return;
      }
      attempts += 1;
    }
    // 경로 찾기 실패시 잠시 대기
    console.warn('Thief failed to find path after 15 attempts, will retry later');
    this.thief.setPath([]);
    this.thiefPathTimer = rand(2, 4);
  }


  setupAutonomousSpeech(npc, pool) {
    this.randomSpeechTimers.set(npc.id, {
      pool,
      timer: rand(4, 9),
    });
  }

  setMode(mode) {
    this.mode = mode;
    this.dialogueManager.reset();
    this.entities = [];
    this.entitiesById.clear();
    this.focusedNPC = null;
    this.batteries = [];
    this.randomSpeechTimers.clear();
    this.speechLayer.clear();
    this.dialogueInput.disabled = true;
    this.dialogueInput.placeholder = 'NPC에게 접근하면 대화할 수 있습니다';
    this.autoGreetingCooldown = new Map();
    this.guardStallTimer = 0;
    this.thiefStallTimer = 0;
    this.thiefPathTimer = 0;
    this.investigatingAlert.classList.add('hidden'); // 모드 전환 시 경고 숨김
    this.stopAllBgm(); // 모드 전환 시 모든 효과음 정지
    this.stopAllMusic(); // 모드 전환 시 모든 음악 정지
    if (mode === MODES.DAY) {
      this.setupDayMode();
    } else {
      this.setupNightMode();
    }
    this.dialogueManager.setMode(mode);
  }

  handleRandomSpeech(dt) {
    this.randomSpeechTimers.forEach((state, id) => {
      const entity = this.entitiesById.get(id);
      if (!entity) return;
      state.timer -= dt;
      if (state.timer <= 0) {
        const line = pickRandom(state.pool);
        this.dialogueManager.speak(entity, line, { tone: this.mode, hold: 2.4 });
        state.timer = rand(8, 14);
      }
    });
  }

  updateDay(dt) {
    this.groupScripts.forEach((script) => script.update(dt));
    this.handleRandomSpeech(dt);
    
    const isInOffice = this.map.isInsideOffice(this.player.position);
    
    // 교장실에 처음 들어갔을 때 (밖에서 안으로 진입)
    if (isInOffice && !this.wasInOffice) {
      // 처음 진입 시에만 대사 출력
      if (!this.principalGreeted) {
        this.dialogueManager.speak(
          this.principal,
          '안녕하신가 천민. 허락 없이 들어와도 나를 이길 순 없네.',
          { tone: 'day', hold: 4 }
        );
        this.principalGreeted = true;
      }
      
      // 교장실 진입 시 매번 BGM 재생
      this.playPrincipalBgm();
    }
    
    // 교장실 상태 업데이트
    this.wasInOffice = isInOffice;
  }

  playDayBgm() {
    if (!this.dayBgm || !this.musicEnabled) return;
    
    // 이미 재생 중이면 다시 시작하지 않음
    if (!this.dayBgm.paused) return;
    
    // 측정값: -22.5 dB → 목표: -24 dB → -1.5 dB 조정 → 0.84배 → 0.29
    this.dayBgm.volume = 0.29;
    this.dayBgm.play().catch(err => {
      console.error('낮 배경음악 재생 실패:', err);
    });
    console.log('🎶 Day BGM started');
  }
  
  stopDayBgm() {
    if (!this.dayBgm) return;
    
    this.dayBgm.pause();
    this.dayBgm.currentTime = 0;
    console.log('🎶 Day BGM stopped');
  }
  
  playNightBgm() {
    if (!this.nightBgm || !this.musicEnabled) return;
    
    // 이미 재생 중이면 다시 시작하지 않음
    if (!this.nightBgm.paused) return;
    
    // 측정값: -25.5 dB → 목표: -24 dB → +1.5 dB 조정 → 1.19배 → 0.42
    this.nightBgm.volume = 0.42;
    this.nightBgm.play().catch(err => {
      console.error('밤 배경음악 재생 실패:', err);
    });
    console.log('🎶 Night BGM started');
  }
  
  stopNightBgm() {
    if (!this.nightBgm) return;
    
    this.nightBgm.pause();
    this.nightBgm.currentTime = 0;
    console.log('🎶 Night BGM stopped');
  }
  
  pauseNightBgm() {
    if (!this.nightBgm || this.nightBgm.paused) return;
    
    this.nightBgm.pause();
    console.log('⏸️ Night BGM paused');
  }
  
  resumeNightBgm() {
    if (!this.nightBgm || !this.nightBgm.paused || !this.musicEnabled) return;
    
    this.nightBgm.play().catch(err => {
      console.error('밤 배경음악 재개 실패:', err);
    });
    console.log('▶️ Night BGM resumed');
  }

  playPrincipalBgm() {
    if (!this.principalBgm || !this.bgmEnabled) return;
    
    this.principalBgm.currentTime = 0;
    // 측정값: -29.6 dB → 목표: -20 dB → +9.6 dB 조정 → 3.02배 → 1.0 (max)
    this.principalBgm.volume = 1.0;
    this.principalBgm.play().catch(err => {
      console.error('교장실 효과음 재생 실패:', err);
    });
    console.log('🎵 Principal SFX started');
  }

  updateNight(dt) {
    if (this.guard) {
      this.guard.update(dt);
    }
    
    if (this.thief) {
      this.thief.update(dt);
      this.thiefPathTimer -= dt;
      
      // 도둑이 경로가 없고 타이머 만료되면 새 경로 시도
      if (this.thiefPathTimer <= 0) {
        this.scheduleThiefPath(true);
      }
    }

    if (this.guard && this.player && !this.pendingReset) {
      const canSee = this.guard.isPointInCone(this.player.position) &&
        hasLineOfSight(this.guard.position, this.player.position, this.map.obstacles);
      if (canSee) {
        this.triggerGameOver();
      }
    }

    // 순찰 중 경고 표시 제어
    if (this.noiseEvent && this.guard && this.guard.investigating) {
      this.investigatingAlert.classList.remove('hidden');
    } else {
      this.investigatingAlert.classList.add('hidden');
    }

    // 소음 이벤트 처리: 경비원이 진원지에 도착하면 가장 가까운 순찰 지점으로 복귀
    if (this.noiseEvent && this.guard) {
      const arrived = distance(this.guard.position, this.noiseEvent.position) < 20;
      if (arrived) {
        console.log('✅ Guard arrived at noise source, resuming patrol');
        this.noiseEvent = null;
        this.guard.investigating = false;
        this.guard.speed = this.guard.baseSpeed; // 속도 복원
        this.stopChaseBgm(); // BGM 정지
        this.resumePatrolFromNearestPoint();
      }
      
      // 안전 장치: 경로를 다 소진했는데 도착하지 못한 경우 자동 복귀
      if (this.guard.investigating && (!this.guard.path || this.guard.pathIndex >= this.guard.path.length - 1)) {
        const distToTarget = distance(this.guard.position, this.noiseEvent.position);
        if (distToTarget >= 20) {
          console.warn(`⚠️ Guard failed to reach noise source (${Math.round(distToTarget)}px away), resuming patrol`);
          this.noiseEvent = null;
          this.guard.investigating = false;
          this.guard.speed = this.guard.baseSpeed; // 속도 복원
          this.stopChaseBgm(); // BGM 정지
          this.resumePatrolFromNearestPoint();
        }
      }
    }
  }

  handleBatteryCollection() {
    if (this.mode !== MODES.NIGHT || this.pendingReset) return;
    for (const battery of this.batteries) {
      if (battery.collected) continue;
      if (distance(this.player.position, battery.position) < 28) {
        battery.collected = true;
        this.collectedBatteries += 1;
        this.batteryHud.fill(this.collectedBatteries);
        this.messageBanner.show('배터리를 수집했습니다! (소음 발생)', 5);
        this.dialogueManager.speak(this.player, '배터리를 챙겼다...', { tone: 'night', hold: 2.5 });
        this.triggerNoiseEvent(battery.position);
        
        // 비디오 컷씬 재생
        this.playCutscene();
        
        if (this.collectedBatteries >= BATTERY_COUNT) {
          this.handleNightVictory();
        }
        break;
      }
    }
  }

  playCutscene() {
    if (!this.cutsceneContainer || !this.cutsceneVideo) return;
    
    // 게임 일시정지
    this.paused = true;
    
    // 비디오 컨테이너 표시
    this.cutsceneContainer.classList.remove('hidden');
    
    // 비디오 재생
    this.cutsceneVideo.currentTime = 0;
    this.cutsceneVideo.play().catch(err => {
      console.error('비디오 재생 실패:', err);
      this.cutsceneContainer.classList.add('hidden');
      this.paused = false; // 실패 시 게임 재개
    });
    
    // 비디오 종료 시 숨김 처리 및 게임 재개
    const onVideoEnd = () => {
      this.cutsceneContainer.classList.add('hidden');
      this.cutsceneVideo.removeEventListener('ended', onVideoEnd);
      this.paused = false; // 게임 재개
      
      // 컷씬이 끝나면 BGM 재생 (조사 시작)
      this.playChaseBgm();
    };
    
    this.cutsceneVideo.addEventListener('ended', onVideoEnd);
    
    // ESC 키나 클릭으로 스킵 가능
    const skipCutscene = () => {
      this.cutsceneVideo.pause();
      this.cutsceneContainer.classList.add('hidden');
      this.cutsceneVideo.removeEventListener('ended', onVideoEnd);
      this.cutsceneContainer.removeEventListener('click', skipCutscene);
      document.removeEventListener('keydown', escapeHandler);
      this.paused = false; // 게임 재개
      
      // 스킵해도 BGM 재생 (조사 시작)
      this.playChaseBgm();
    };
    
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        skipCutscene();
      }
    };
    
    this.cutsceneContainer.addEventListener('click', skipCutscene, { once: true });
    document.addEventListener('keydown', escapeHandler, { once: true });
  }

  playChaseBgm() {
    if (!this.chaseBgm || !this.bgmEnabled) return;
    
    // 아오오니 브금 시작 시 밤 배경음악 일시정지
    this.pauseNightBgm();
    
    this.chaseBgm.currentTime = 0;
    // 측정값: -16.1 dB → 목표: -18 dB → -1.9 dB 조정 → 0.80배 → 0.40
    this.chaseBgm.volume = 0.40;
    this.chaseBgm.play().catch(err => {
      console.error('BGM 재생 실패:', err);
    });
    console.log('🎵 Chase BGM started (Night BGM paused)');
  }

  stopChaseBgm() {
    if (!this.chaseBgm) return;
    
    this.chaseBgm.pause();
    this.chaseBgm.currentTime = 0;
    
    // 아오오니 브금 종료 시 밤 배경음악 재개
    if (this.mode === MODES.NIGHT) {
      this.resumeNightBgm();
    }
    
    console.log('🎵 Chase BGM stopped (Night BGM resumed)');
  }

  stopAllBgm() {
    this.stopChaseBgm();
    if (this.principalBgm && !this.principalBgm.paused) {
      this.principalBgm.pause();
      this.principalBgm.currentTime = 0;
      console.log('🎵 Principal SFX stopped');
    }
    if (this.caughtSfx && !this.caughtSfx.paused) {
      this.caughtSfx.pause();
      this.caughtSfx.currentTime = 0;
      console.log('💀 Caught SFX stopped');
    }
    if (this.approachSfx1 && !this.approachSfx1.paused) {
      this.approachSfx1.pause();
      this.approachSfx1.currentTime = 0;
    }
    if (this.approachSfx2 && !this.approachSfx2.paused) {
      this.approachSfx2.pause();
      this.approachSfx2.currentTime = 0;
    }
  }
  
  stopAllMusic() {
    this.stopDayBgm();
    this.stopNightBgm();
  }

  triggerNoiseEvent(position) {
    if (!this.guard) return;
    
    console.log(`🔊 Noise event triggered at (${Math.round(position.x)}, ${Math.round(position.y)})`);
    console.log(`📍 Guard current position: (${Math.round(this.guard.position.x)}, ${Math.round(this.guard.position.y)})`);
    
    // 이미 노이즈 조사 중이면 즉시 경로 변경
    if (this.noiseEvent && this.guard.investigating) {
      console.log(`🔄 Guard already investigating, switching to new noise event immediately`);
    }
    
    // 그리드 네트워크를 따라 경로 찾기 (사다리타기 방식 + A* 보조)
    const gridPath = this.map.findPathOnGrid(this.guard.position, position, this.pathfinder);
    
    if (gridPath && gridPath.length > 0) {
      console.log(`✅ Grid path created with ${gridPath.length} waypoints`);
      const pathWithAction = gridPath.map(p => ({ ...p, action: 'move' }));
      this.noiseEvent = { position, originalPosition: position };
      this.guard.followPath(pathWithAction, true);
      
      // 긴장 모드 활성화: 카메라 확대
      this.camera.setTenseMode(true);
      console.log('📹 Camera: Tense mode activated (zoom increased)');
    } else {
      console.error('❌ Failed to create grid path to noise source, guard continues patrol');
      this.noiseEvent = null;
    }
  }

  buildHybridPathToNoise(noisePosition) {
    let guardPos = { ...this.guard.position };
    const fullPath = [];
    
    // 시작점이 walkable한지 확인
    if (!this.map.isWalkableCircle(guardPos, this.guard.radius)) {
      console.warn(`⚠️ Guard start position not walkable in hybrid path`);
      const safePos = this.findNearestWalkableToNoise(guardPos);
      if (!safePos) {
        console.error(`❌ Cannot find safe start position`);
        return null;
      }
      guardPos = safePos;
    }
    
    // 1단계: 경비원이 교실 안에 있는지 확인
    const guardRoom = this.findRoomContaining(guardPos);
    const noiseRoom = this.findRoomContaining(noisePosition);
    
    console.log(`🏫 Guard in room: ${guardRoom?.name || 'hallway'}, Noise in: ${noiseRoom?.name || 'hallway'}`);
    
    // 2단계: 현재 교실에서 문까지 (전통 경로 사용)
    let startPoint = guardPos;
    if (guardRoom) {
      const doorPoint = this.findNearestDoorPoint(guardRoom);
      if (doorPoint) {
        console.log(`🚪 Exiting ${guardRoom.name} via door at (${Math.round(doorPoint.x)}, ${Math.round(doorPoint.y)})`);
        const exitPath = this.pathfinder.findPath(guardPos, doorPoint);
        if (exitPath && exitPath.length > 0) {
          fullPath.push(...exitPath.map(p => ({ ...p, action: 'move' })));
          startPoint = doorPoint;
        } else {
          console.warn(`⚠️ Exit path failed, using guard position as start`);
          startPoint = guardPos;
        }
      }
    }
    
    // 3단계: 복도에서 목표 교실 문까지 (A* 사용)
    let targetDoor = noisePosition;
    if (noiseRoom) {
      const noiseDoor = this.findNearestDoorPoint(noiseRoom);
      if (noiseDoor) {
        targetDoor = noiseDoor;
        console.log(`🎯 Target door at (${Math.round(noiseDoor.x)}, ${Math.round(noiseDoor.y)})`);
      }
    }
    
    const corridorPath = this.pathfinder.findPath(startPoint, targetDoor);
    if (corridorPath && corridorPath.length > 0) {
      // 중복 제거
      if (fullPath.length > 0 && corridorPath.length > 0) corridorPath.shift();
      fullPath.push(...corridorPath.map(p => ({ ...p, action: 'move' })));
    } else {
      console.warn('⚠️ Corridor path failed, trying direct path');
      // 복도 경로 실패 시 직접 경로 시도
      const directPath = this.pathfinder.findPath(guardPos, noisePosition);
      if (directPath && directPath.length > 0) {
        console.log(`✓ Using direct path instead (${directPath.length} waypoints)`);
        return directPath.map(p => ({ ...p, action: 'move' }));
      }
      return null;
    }
    
    // 4단계: 목표 교실 문에서 소음 위치까지 (전통 경로 또는 직접)
    if (noiseRoom && targetDoor !== noisePosition) {
      const finalPath = this.pathfinder.findPath(targetDoor, noisePosition);
      if (finalPath && finalPath.length > 0) {
        finalPath.shift();
        fullPath.push(...finalPath.map(p => ({ ...p, action: 'move' })));
      } else {
        console.warn(`⚠️ Final segment failed, stopping at door`);
      }
    }
    
    console.log(`📊 Hybrid path segments: ${fullPath.length} total waypoints`);
    return fullPath.length > 0 ? fullPath : null;
  }

  findRoomContaining(position) {
    // 교실 체크
    for (const room of this.map.classrooms) {
      if (position.x >= room.rect.x && 
          position.x <= room.rect.x + room.rect.width &&
          position.y >= room.rect.y && 
          position.y <= room.rect.y + room.rect.height) {
        return room;
      }
    }
    // 교장실 체크
    if (position.x >= this.map.office.x && 
        position.x <= this.map.office.x + this.map.office.width &&
        position.y >= this.map.office.y && 
        position.y <= this.map.office.y + this.map.office.height) {
      return { name: 'Office', rect: this.map.office };
    }
    return null;
  }

  findNearestDoorPoint(room) {
    // 순찰 경로에서 해당 교실의 문 지점 찾기
    const roomCenter = {
      x: room.rect.x + room.rect.width / 2,
      y: room.rect.y + room.rect.height / 2
    };
    
    // 교실이 상단인지 하단인지 판단
    const isTopRow = room.rect.y < this.map.hallwayRect.y + this.map.hallwayRect.height / 2;
    
    const doorX = room.rect.x + room.rect.width / 2;
    const doorY = isTopRow 
      ? room.rect.y + room.rect.height + 25  // 상단 교실: 아래쪽 문
      : room.rect.y - 25;                     // 하단 교실: 위쪽 문
    
    return { x: doorX, y: doorY };
  }

  findNearestWalkableToNoise(position) {
    // 나선형으로 근처 walkable 지점 찾기
    const step = 15;
    const maxRadius = 100;
    for (let radius = step; radius <= maxRadius; radius += step) {
      const angles = 12;
      for (let i = 0; i < angles; i += 1) {
        const angle = (Math.PI * 2 * i) / angles;
        const testPoint = {
          x: position.x + Math.cos(angle) * radius,
          y: position.y + Math.sin(angle) * radius,
        };
        if (this.map.isWalkableCircle(testPoint, 16)) {
          return testPoint;
        }
      }
    }
    return null;
  }

  resumePatrolFromNearestPoint() {
    if (!this.guard || !this.guardPatrolPath || this.guardPatrolPath.length === 0) {
      console.warn('Cannot resume patrol: no guard or patrol path');
      return;
    }

    // 순찰 경로에서 교실 중앙 (scan 액션) 포인트들 찾기
    const scanPoints = [];
    this.guardPatrolPath.forEach((node, index) => {
      if (node.action === 'scan') {
        scanPoints.push({ node, index });
      }
    });

    if (scanPoints.length === 0) {
      console.warn('No scan points found, resuming from start');
      this.guard.setPatrolPath(this.guardPatrolPath);
      // 긴장 모드 해제
      this.camera.setTenseMode(false);
      console.log('📹 Camera: Tense mode deactivated (zoom restored)');
      return;
    }

    // 현재 위치에서 가장 가까운 교실(scan point) 찾기
    let nearestScanPoint = null;
    let minDistance = Infinity;
    
    scanPoints.forEach((sp) => {
      const dist = distance(this.guard.position, sp.node);
      if (dist < minDistance) {
        minDistance = dist;
        nearestScanPoint = sp;
      }
    });

    if (!nearestScanPoint) {
      console.warn('Could not find nearest scan point, resuming from start');
      this.guard.setPatrolPath(this.guardPatrolPath);
      // 긴장 모드 해제
      this.camera.setTenseMode(false);
      console.log('📹 Camera: Tense mode deactivated (zoom restored)');
      return;
    }

    console.log(`Nearest patrol point is at index ${nearestScanPoint.index}, distance: ${Math.round(minDistance)}`);

    // 가장 가까운 교실의 문 위치 찾기 (scan 포인트 바로 앞)
    const doorIndex = nearestScanPoint.index - 1;
    if (doorIndex >= 0 && doorIndex < this.guardPatrolPath.length) {
      const doorPoint = this.guardPatrolPath[doorIndex];
      
      // 현재 위치에서 그 교실 문까지 그리드 경로 찾기 (안전하게!)
      const pathToDoor = this.map.findPathOnGrid(this.guard.position, doorPoint, this.pathfinder);
      
      if (pathToDoor && pathToDoor.length > 0) {
        console.log(`Resuming patrol from room at index ${doorIndex}, grid path length: ${pathToDoor.length}`);
        
        // 문까지 가는 경로 + 그 지점부터의 순찰 경로 합치기
        const resumePath = [
          ...pathToDoor.slice(0, -1).map(p => ({ ...p, action: 'move' })),
          ...this.guardPatrolPath.slice(doorIndex)
        ];
        
        this.guard.path = resumePath;
        this.guard.pathIndex = 0;
        this.guard.investigating = false;
        this.guard.scanning = false;
        this.guard.speed = this.guard.baseSpeed; // 속도 복원
        
        // 긴장 모드 해제
        this.camera.setTenseMode(false);
        console.log('📹 Camera: Tense mode deactivated (zoom restored)');
        return;
      }
    }

    // 경로 찾기 실패시 그냥 처음부터 순찰 재개
    console.warn('Failed to find path to nearest patrol point, resuming from start');
    this.guard.speed = this.guard.baseSpeed; // 속도 복원
    this.guard.setPatrolPath(this.guardPatrolPath);
    
    // 긴장 모드 해제
    this.camera.setTenseMode(false);
    console.log('📹 Camera: Tense mode deactivated (zoom restored)');
  }

  handleNightVictory() {
    if (this.pendingReset) return;
    this.pendingReset = { mode: MODES.NIGHT, timer: 4 };
    this.messageBanner.show('모든 배터리를 모았습니다! 조심히 탈출하세요.', 4);
    setTimeout(() => this.setMode(MODES.NIGHT), 4200);
  }

  triggerGameOver() {
    if (this.pendingReset) return;
    this.pendingReset = { mode: MODES.NIGHT, timer: 3 };
    
    // 게임오버 효과음 재생
    this.playCaughtSfx();
    
    this.dialogueManager.speak(this.guard, '거기 누굽니까!!!', { tone: 'night', hold: 3 });
    this.messageBanner.show('거기 누굽니까!!! 경비원에게 들켰습니다.', 3);
    setTimeout(() => this.setMode(MODES.NIGHT), 3200);
  }
  
  playCaughtSfx() {
    if (!this.caughtSfx || !this.bgmEnabled) return;
    
    this.caughtSfx.currentTime = 0;
    // 측정값: -33.7 dB → 목표: -20 dB → +13.7 dB 조정 → 4.83배 → 0.96
    this.caughtSfx.volume = 0.96;
    this.caughtSfx.play().catch(err => {
      console.error('게임오버 효과음 재생 실패:', err);
    });
    console.log('💀 Caught SFX started');
  }

  update(dt) {
    this.entities.forEach((entity) => {
      if (
        entity !== this.guard &&
        entity !== this.player &&
        entity !== this.thief &&
        typeof entity.update === 'function'
      ) {
        entity.update(dt);
      }
    });
    this.player.update(dt);
    this.camera.update(dt); // 카메라 업데이트
    if (this.mode === MODES.DAY) {
      this.updateDay(dt);
    } else {
      this.updateNight(dt);
    }
    this.updateFocusNPC();
    this.dialogueManager.update(dt, this.entitiesById);
  }

  updateFocusNPC() {
    if (this.pendingReset) {
      this.dialogueInput.disabled = true;
      this.dialogueInput.placeholder = 'NPC에게 접근하면 대화할 수 있습니다';
      this.focusedNPC = null;
      return;
    }
    const candidates = this.entities.filter(
      (entity) =>
        entity !== this.player &&
        !(entity instanceof Battery) &&
        entity.role &&
        distance(this.player.position, entity.position) < CONVERSATION_RANGE
    );
    candidates.sort((a, b) => distance(this.player.position, a.position) - distance(this.player.position, b.position));
    const target = candidates[0] || null;
    if (target !== this.focusedNPC) {
      this.focusedNPC = target;
      if (target) {
        this.maybeAutoGreet(target);
        // 낮 모드에서만 접근 효과음 재생
        if (this.mode === MODES.DAY) {
          this.playRandomApproachSfx(target);
        }
      }
    }
    if (this.focusedNPC) {
      this.dialogueInput.disabled = false;
      this.dialogueInput.placeholder = `${this.focusedNPC.name}에게 말을 걸어보세요.`;
    } else {
      this.dialogueInput.disabled = true;
      this.dialogueInput.placeholder = 'NPC에게 접근하면 대화할 수 있습니다';
      this.dialogueInput.value = '';
    }
  }
  
  playRandomApproachSfx(npc) {
    // 같은 NPC에게 연속으로 재생하지 않도록
    if (this.lastApproachSfxNpc === npc.id) return;
    
    // 효과음이 꺼져있으면 재생하지 않음
    if (!this.bgmEnabled) return;
    
    this.lastApproachSfxNpc = npc.id;
    
    // 1/3 확률로 3가지 중 하나 선택
    const random = Math.random();
    
    if (random < 0.333) {
      // 쵸로키-꿇어라
      if (this.approachSfx1) {
        this.approachSfx1.currentTime = 0;
        // 측정값: -23.3 dB → 목표: -20 dB → +3.3 dB 조정 → 1.46배 → 0.73
        this.approachSfx1.volume = 0.73;
        this.approachSfx1.play().catch(err => {
          console.error('접근 효과음1 재생 실패:', err);
        });
        console.log('🗣️ Approach SFX: 꿇어라');
      }
    } else if (random < 0.666) {
      // 쵸로키-야이새끼야
      if (this.approachSfx2) {
        this.approachSfx2.currentTime = 0;
        // 측정값: -38.6 dB → 목표: -20 dB → +18.6 dB 조정 → 8.51배 → 1.0 (max)
        this.approachSfx2.volume = 1.0;
        this.approachSfx2.play().catch(err => {
          console.error('접근 효과음2 재생 실패:', err);
        });
        console.log('🗣️ Approach SFX: 야이새끼야');
      }
    } else {
      // 아무것도 재생 안 함
      console.log('🔇 Approach SFX: (silent)');
    }
    
    // 잠시 후 같은 NPC에게도 다시 재생 가능하도록
    setTimeout(() => {
      if (this.lastApproachSfxNpc === npc.id) {
        this.lastApproachSfxNpc = null;
      }
    }, 2000); // 2초 쿨다운
  }

  maybeAutoGreet(target) {
    const now = performance.now();
    const cooldown = this.autoGreetingCooldown.get(target.id) || 0;
    if (now < cooldown) return;
    let probability = 0;
    let line = '';
    if ((target.name === 'D' || target.name === 'F') && (target.affinity || 0) >= 0.7) {
      probability = 0.5;
      line = '우리 얘기에 합류해볼래?';
    } else if (target.role === 'principal') {
      probability = 0.5;
      line = '안녕하신가 천민. 들어왔으면 예의를 갖춰라.';
    } else if (target.role === 'teacher') {
      probability = 0.5;
      line = '수업 준비는 잘 되어 있나요? 지금 궁금한 거 있으면 말해요.';
    } else if (target.role === 'student') {
      probability = 0.5;
      line = '잠깐 쉬는 중인데, 같이 떠들래?';
    } else if (target.role === 'thief') {
      probability = 0.3;
      line = '소음 내지 말고 조용히 있으세요. 전 제 일 중입니다.';
    } else if (target.role === 'guard') {
      probability = 0.3;
      line = '야간 순찰 중입니다. 움직임 조심하세요.';
    }
    if (probability && chance(probability)) {
      this.dialogueManager.speak(target, line, { tone: this.mode, hold: 3.2 });
      this.autoGreetingCooldown.set(target.id, now + 6000);
    }
  }

  async handleDialogue() {
    if (!this.focusedNPC || this.waitingForResponse) return;
    const value = this.dialogueInput.value.trim();
    if (!value) return;
    this.dialogueInput.value = '';
    this.dialogueManager.speak(this.player, value, { tone: this.mode, hold: 2.5 });
    this.waitingForResponse = true;
    this.dialogueInput.disabled = true;
    const npc = this.focusedNPC;
    const prompt = npcPrompts[npc.role] || npcPrompts.student;
    const reply = await this.dialogueManager.askLLM(npc, prompt, value);
    const message = reply || fallbackReply(npc.name);
    this.dialogueManager.speak(npc, message, { tone: this.mode, hold: 4 });
    npc.affinity = Math.min(1, (npc.affinity || 0) + 0.1);
    this.waitingForResponse = false;
    this.dialogueInput.disabled = false;
  }

  render() {
    this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 낮 모드 버퍼 렌더링 (카메라 적용)
    if (this.mode === MODES.NIGHT) {
      this.renderDayBuffer();
    }
    
    // 카메라 변환 적용
    this.camera.applyTransform(this.ctx);
    
    // 월드 요소 렌더링 (카메라 영향 받음)
    this.map.render(this.ctx, this.mode, this.debugColliders);
    this.batteries.forEach((battery) => battery.draw(this.ctx));
    this.entities.forEach((entity) => entity.draw(this.ctx, this.mode));
    
    if (this.showGrid) {
      this.renderNavigationGrid();
    }
    
    this.renderHearingOverlay();
    
    // 밤 조명 효과 - 경비원 시야 (카메라 변환 내)
    if (this.mode === MODES.NIGHT && this.guard) {
      renderNightLighting(this.ctx, this.guard, this.map.obstacles, this.dayCanvas, this.camera);
    }
    
    // 카메라 변환 해제
    this.camera.resetTransform(this.ctx);
    
    // 밤 어두운 오버레이 (화면 고정)
    if (this.mode === MODES.NIGHT) {
      // 어두운 오버레이를 전체 화면에 적용하되, 경비원 시야는 밝게
      renderNightOverlay(this.ctx, this.guard, this.map.obstacles, this.camera);
    }
    
    // 긴장 모드일 때 비네팅 효과 (화면 고정)
    if (this.noiseEvent && this.guard && this.guard.investigating) {
      this.renderVignette();
    }
  }
  
  renderVignette() {
    const ctx = this.ctx;
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
    
    // 방사형 그라데이션으로 비네팅 효과
    const gradient = ctx.createRadialGradient(
      centerX, centerY, maxRadius * 0.3,
      centerX, centerY, maxRadius * 1.2
    );
    
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)');
    gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }

  renderNavigationGrid() {
    if (!this.map.navigationGrid || this.map.navigationGrid.length === 0) return;
    
    this.ctx.save();
    
    // 복도 중앙선 (유일한 가로선)
    const hallwayY_center = this.map.hallwayRect.y + this.map.hallwayRect.height / 2;
    
    // 1. 복도 중앙 가로선 그리기
    this.ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([15, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.map.hallwayRect.x, hallwayY_center);
    this.ctx.lineTo(this.map.hallwayRect.x + this.map.hallwayRect.width, hallwayY_center);
    this.ctx.stroke();
    
    // 2. 교실 정중앙 수직선 그리기
    this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([10, 5]);
    this.map.classrooms.forEach((room) => {
      const roomCenterX = room.rect.x + room.rect.width / 2;
      this.ctx.beginPath();
      this.ctx.moveTo(roomCenterX, room.rect.y);
      this.ctx.lineTo(roomCenterX, room.rect.y + room.rect.height);
      this.ctx.stroke();
      
      // 복도 부분도 이어서
      const isTopRow = room.rect.y + room.rect.height / 2 < CANVAS_HEIGHT / 2;
      if (isTopRow) {
        this.ctx.beginPath();
        this.ctx.moveTo(roomCenterX, room.rect.y + room.rect.height);
        this.ctx.lineTo(roomCenterX, hallwayY_center);
        this.ctx.stroke();
      } else {
        this.ctx.beginPath();
        this.ctx.moveTo(roomCenterX, hallwayY_center);
        this.ctx.lineTo(roomCenterX, room.rect.y);
        this.ctx.stroke();
      }
    });
    
    // 교장실 중앙 수직선
    const officeCenterX = this.map.office.x + this.map.office.width / 2;
    this.ctx.beginPath();
    this.ctx.moveTo(officeCenterX, this.map.office.y - 40);
    this.ctx.lineTo(officeCenterX, this.map.office.y + this.map.office.height + 40);
    this.ctx.stroke();
    
    // 교장실 좌측 우회 수직선 (보라색)
    const officeLeftX = this.map.office.x - 40;
    this.ctx.strokeStyle = 'rgba(255, 150, 255, 0.5)';
    this.ctx.beginPath();
    this.ctx.moveTo(officeLeftX, this.map.office.y - 40);
    this.ctx.lineTo(officeLeftX, this.map.office.y + this.map.office.height + 40);
    this.ctx.stroke();
    
    // 교장실 우측 우회 수직선 (보라색)
    const officeRightX = this.map.office.x + this.map.office.width + 40;
    this.ctx.beginPath();
    this.ctx.moveTo(officeRightX, this.map.office.y - 40);
    this.ctx.lineTo(officeRightX, this.map.office.y + this.map.office.height + 40);
    this.ctx.stroke();
    
    this.ctx.setLineDash([]);
    
    // 3. 연결선 그리기
    this.ctx.strokeStyle = 'rgba(100, 255, 100, 0.3)';
    this.ctx.lineWidth = 2;
    const drawnLines = new Set();
    this.map.navigationGrid.forEach((node) => {
      node.neighbors.forEach((neighbor) => {
        const neighborNode = this.map.navigationGrid[neighbor.id];
        if (!neighborNode) return;
        
        const lineKey = `${Math.min(node.id, neighbor.id)}-${Math.max(node.id, neighbor.id)}`;
        if (drawnLines.has(lineKey)) return;
        drawnLines.add(lineKey);
        
        this.ctx.beginPath();
        this.ctx.moveTo(node.x, node.y);
        this.ctx.lineTo(neighborNode.x, neighborNode.y);
        this.ctx.stroke();
      });
    });
    
    // 4. 노드 그리기
    this.map.navigationGrid.forEach((node) => {
      let nodeColor, nodeSize;
      
      if (node.type === 'door') {
        nodeColor = 'rgba(255, 100, 100, 0.9)'; // 빨강 = 문
        nodeSize = 9;
      } else if (node.type === 'bypass' || node.type === 'bypass-center') {
        nodeColor = 'rgba(255, 150, 255, 0.9)'; // 보라 = 교장실 우회 경로
        nodeSize = 9;
      } else if (node.type === 'hallway-center' || node.type === 'alley-center') {
        nodeColor = 'rgba(255, 200, 0, 0.9)'; // 노랑 = 복도 중앙
        nodeSize = 10;
      } else if (node.type === 'edge') {
        nodeColor = 'rgba(150, 255, 150, 0.9)'; // 연두 = 좌우 끝
        nodeSize = 8;
      } else {
        nodeColor = 'rgba(100, 200, 255, 0.9)'; // 파랑 = 중간지점
        nodeSize = 7;
      }
      
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
      this.ctx.fillStyle = nodeColor;
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      
      // 노드 ID
      this.ctx.fillStyle = (node.type === 'hallway-center' || node.type === 'alley-center') ? '#000' : '#fff';
      this.ctx.font = 'bold 10px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(node.id, node.x, node.y);
    });
    
    // 5. 범례
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(10, 80, 230, 140);
    
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.fillStyle = '#fff';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('🟡 복도 중앙 (가로선)', 20, 100);
    this.ctx.fillText('🔵 교실 중심 (수직선)', 20, 116);
    this.ctx.fillText('🔴 문 노드', 20, 132);
    this.ctx.fillText('🟣 교장실 우회 경로', 20, 148);
    this.ctx.fillText('🟢 이동 가능 연결선', 20, 164);
    
    this.ctx.fillStyle = '#ffff00';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.fillText(`총 ${this.map.navigationGrid.length}개 노드`, 20, 195);
    
    const bypassCount = this.map.navigationGrid.filter(n => n.type === 'bypass' || n.type === 'bypass-center').length;
    if (bypassCount > 0) {
      this.ctx.fillStyle = '#ff88ff';
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.fillText(`(우회: ${bypassCount}개)`, 20, 208);
    }
    
    this.ctx.restore();
  }

  renderHearingOverlay() {
    if (!this.player) return;
    this.ctx.save();
    const colors = ['rgba(120,210,130,0.35)', 'rgba(120,170,210,0.25)', 'rgba(150,150,210,0.2)', 'rgba(120,120,160,0.15)'];
    HEARING_RINGS.forEach((radius, index) => {
      this.ctx.beginPath();
      this.ctx.strokeStyle = colors[index] || 'rgba(200,200,200,0.15)';
      this.ctx.lineWidth = 2;
      this.ctx.arc(this.player.position.x, this.player.position.y, radius, 0, Math.PI * 2);
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033);
    this.lastTime = timestamp;
    
    // 일시정지 상태가 아닐 때만 업데이트
    if (!this.paused) {
      this.update(dt);
    }
    
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }
}

const controller = new GameController({
  canvas: document.getElementById('gameCanvas'),
  speechLayerNode: document.getElementById('speechLayer'),
  dialogueForm: document.getElementById('dialogueForm'),
  dialogueInput: document.getElementById('dialogueInput'),
  modeSwitch: document.getElementById('modeSwitch'),
  messageBanner: document.getElementById('messageBanner'),
  batteryHud: document.getElementById('batteryHud'),
  investigatingAlert: document.getElementById('investigatingAlert'),
  gridToggle: document.getElementById('gridToggle'),
  cutsceneContainer: document.getElementById('cutsceneContainer'),
  cutsceneVideo: document.getElementById('cutsceneVideo'),
  bgmToggle: document.getElementById('bgmToggle'),
  musicToggle: document.getElementById('musicToggle'),
  chaseBgm: document.getElementById('chaseBgm'),
  dayBgm: document.getElementById('dayBgm'),
  nightBgm: document.getElementById('nightBgm'),
});

export default controller;
