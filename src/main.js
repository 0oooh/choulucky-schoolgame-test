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
import { ChorokiRoomMap } from './world/chorokiRoom.js';
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
  constructor({ canvas, speechLayerNode, dialogueForm, dialogueInput, modeSwitch, messageBanner, batteryHud, investigatingAlert, gridToggle, cutsceneContainer, cutsceneVideo, schoolCutsceneContainer, schoolCutsceneVideo, lieDownCutsceneContainer, lieDownCutsceneVideo, sleepCutsceneContainer, sleepCutsceneVideo, bgmToggle, musicToggle, hearingToggle, chaseBgm, dayBgm, nightBgm, spitGumButton, graffityButton, lieDownButton, fireButton }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new InputManager();
    this.map = new SchoolMap();
    this.entities = [];
    this.entitiesById = new Map();
    this.randomSpeechTimers = new Map();
    this.groupScripts = [];
    this.batteries = [];
    this.gums = []; // 껌 배열
    this.graffities = []; // 낙서 선들 배열
    this.isGraffityMode = false; // 낙서 모드 활성화 여부
    this.lastGraffityPos = null; // 마지막 낙서 위치
    this.focusedNPC = null;
    this.waitingForResponse = false;
    this.principalGreeted = false;
    this.noiseEvent = null;
    this.pendingReset = null;
    this.collectedBatteries = 0;
    this.autoGreetingCooldown = new Map();
    this.thiefPathTimer = 0;
    this.guardPatrolPath = [];
    this.spitGumButton = spitGumButton;
    this.graffityButton = graffityButton;
    this.lieDownButton = lieDownButton;
    this.fireButton = fireButton;
    this.lieDownOverlay = document.getElementById('lieDownOverlay');
    this.lieDownOverlayText = document.getElementById('lieDownOverlayText');
    this.guardStallTimer = 0;
    this.thiefStallTimer = 0;
    this.guardPatrolPath = [];
    this.debugColliders = false; // 디버그 모드 (D 키로 토글)
    this.showGrid = false; // 그리드 표시 여부
    this.paused = false; // 게임 일시정지 상태
    this.bgmEnabled = true; // 효과음 활성화 여부
    this.musicEnabled = true; // 음악 활성화 여부
    this.hearingEnabled = true; // 청각 범위 표시 여부
    this.wasInOffice = false; // 교장실에 있었는지 추적
    this.roomState = null; // 쵸로키 방 상태
    
    // 카메라 시스템
    this.camera = new Camera({ zoom: CAMERA_ZOOM, smoothing: CAMERA_SMOOTHING });
    this.camera.setBaseZoom(CAMERA_ZOOM);

    this.speechLayer = new SpeechLayer(speechLayerNode);
    this.messageBanner = new MessageBanner(messageBanner);
    this.batteryHud = new BatteryHud(batteryHud);
    this.investigatingAlert = investigatingAlert;
    this.cutsceneContainer = cutsceneContainer;
    this.cutsceneVideo = cutsceneVideo;
    this.schoolCutsceneContainer = schoolCutsceneContainer;
    this.schoolCutsceneVideo = schoolCutsceneVideo;
    this.lieDownCutsceneContainer = lieDownCutsceneContainer;
    this.lieDownCutsceneVideo = lieDownCutsceneVideo;
    this.sleepCutsceneContainer = sleepCutsceneContainer;
    this.sleepCutsceneVideo = sleepCutsceneVideo;
    this.bgmToggle = bgmToggle;
    this.musicToggle = musicToggle;
    this.hearingToggle = hearingToggle;
    this.chaseBgm = chaseBgm;
    this.dayBgm = dayBgm;
    this.nightBgm = nightBgm;
    this.roomNightBgm = document.getElementById('roomNightBgm');
    this.roomMorningBgm = document.getElementById('roomMorningBgm');
    this.principalBgm = document.getElementById('principalBgm');
    this.caughtSfx = document.getElementById('caughtSfx');
    this.approachSfx1 = document.getElementById('approachSfx1');
    this.approachSfx2 = document.getElementById('approachSfx2');
    this.spitSfx1 = document.getElementById('spitSfx1');
    this.spitSfx2 = document.getElementById('spitSfx2');
    this.fireSfx = document.getElementById('fireSfx');
    this.graffityStartSfx = document.getElementById('graffityStartSfx');
    this.graffityLoopSfx = document.getElementById('graffityLoopSfx');
    this.graffityEndSfx = document.getElementById('graffityEndSfx');
    this.lastApproachSfxNpc = null; // 마지막으로 효과음을 재생한 NPC ID
    this.sleepOverlay = document.getElementById('sleepOverlay');
    this.sleepOverlayText = document.getElementById('sleepOverlayText');
    this.roomChoice = document.getElementById('roomChoice');
    this.roomChoiceStay = document.getElementById('stayHomeButton');
    this.roomChoiceSchool = document.getElementById('goSchoolButton');

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
      if (!pressed) return;
      if (this.mode === MODES.NIGHT) {
        this.handleBatteryCollection();
      } else if (this.mode === MODES.ROOM) {
        this.handleRoomInteract();
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
    
    this.input.onKey('spitGum', (pressed) => {
      if (pressed) {
        this.spitGum();
      }
    });
    
    this.input.onKey('graffity', (pressed) => {
      this.isGraffityMode = pressed;
      if (pressed) {
        // 낙서 모드 시작 - 현재 위치 저장
        this.lastGraffityPos = { ...this.player.position };
        this.graffityButton?.classList.add('active');
        this.startGraffitySfx();
        console.log('✏️ 낙서 모드 시작');
      } else {
        // 낙서 모드 종료
        this.lastGraffityPos = null;
        this.graffityButton?.classList.remove('active');
        this.endGraffitySfx();
        console.log('✏️ 낙서 모드 종료');
      }
    });
    
    this.input.onKey('lieDown', (pressed) => {
      if (pressed) {
        this.startLieDownSequence();
      }
    });
    
    this.input.onKey('fire', (pressed) => {
      if (pressed) {
        this.startFire();
      }
    });

    this.bindEvents();
    this.setMode(MODES.ROOM, { roomMorning: true });
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
    
    this.hearingToggle.addEventListener('change', () => {
      this.hearingEnabled = this.hearingToggle.checked;
      console.log(`👂 Hearing range: ${this.hearingEnabled ? 'ON' : 'OFF'}`);
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
        if (this.fireSfx && !this.fireSfx.paused) {
          this.fireSfx.pause();
          this.fireSfx.currentTime = 0;
        }
        if (this.graffityStartSfx && !this.graffityStartSfx.paused) {
          this.graffityStartSfx.pause();
          this.graffityStartSfx.currentTime = 0;
        }
        if (this.graffityLoopSfx && !this.graffityLoopSfx.paused) {
          this.graffityLoopSfx.pause();
          this.graffityLoopSfx.currentTime = 0;
        }
        if (this.graffityEndSfx && !this.graffityEndSfx.paused) {
          this.graffityEndSfx.pause();
          this.graffityEndSfx.currentTime = 0;
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
        if (this.roomNightBgm && !this.roomNightBgm.paused) {
          this.roomNightBgm.pause();
        }
        if (this.roomMorningBgm && !this.roomMorningBgm.paused) {
          this.roomMorningBgm.pause();
        }
      } else {
        // 음악이 켜지면 현재 모드에 맞는 음악 재생
        if (this.mode === MODES.DAY) {
          this.playDayBgm();
        } else if (this.mode === MODES.NIGHT) {
          this.playNightBgm();
        } else if (this.mode === MODES.ROOM) {
          // 방 상태에 따라 BGM 재생
          if (this.map?.isMorning) {
            if (this.map.isMorning()) {
              this.playRoomMorningBgm(); // 아침 상태
            } else {
              this.playRoomNightBgm(); // 밤 상태
            }
          }
        }
      }
    });

    this.roomChoiceStay?.addEventListener('click', () => this.handleRoomChoice('stay'));
    this.roomChoiceSchool?.addEventListener('click', () => this.handleRoomChoice('school'));
    
    this.spitGumButton?.addEventListener('click', () => this.spitGum());
    
    // 낙서 버튼은 토글 방식
    this.graffityButton?.addEventListener('mousedown', () => {
      this.isGraffityMode = true;
      this.lastGraffityPos = { ...this.player.position };
      this.graffityButton?.classList.add('active');
      this.startGraffitySfx();
      console.log('✏️ 낙서 모드 시작 (마우스)');
    });
    
    this.graffityButton?.addEventListener('mouseup', () => {
      this.isGraffityMode = false;
      this.lastGraffityPos = null;
      this.graffityButton?.classList.remove('active');
      this.endGraffitySfx();
      console.log('✏️ 낙서 모드 종료 (마우스)');
    });
    
    this.graffityButton?.addEventListener('mouseleave', () => {
      if (this.isGraffityMode) {
        this.isGraffityMode = false;
        this.lastGraffityPos = null;
        this.graffityButton?.classList.remove('active');
        this.endGraffitySfx();
        console.log('✏️ 낙서 모드 종료 (마우스 나김)');
      }
    });
    
    this.lieDownButton?.addEventListener('click', () => this.startLieDownSequence());
    
    this.fireButton?.addEventListener('click', () => this.startFire());

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

  setupRoomMode() {
    this.batteryHud.reset();
    this.collectedBatteries = 0;
    this.guard = null;
    this.thief = null;
    this.batteries = [];
    this.groupScripts = [];
    this.randomSpeechTimers.clear();

    const spawn = this.map?.getPlayerSpawn ? this.map.getPlayerSpawn() : { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    this.player = new Player({ input: this.input, x: spawn.x, y: spawn.y, color: '#4ed37e' });
    this.player.markerColor = '#4ed37e';
    this.registerEntity(this.player);
    this.applySprite(this.player, 'player');
    this.dialogueManager.bindPlayer(this.player);
    this.dialogueManager.bindCamera(this.camera);
    this.camera.setTarget(this.player);
    this.camera.setBaseZoom(1.25);
    this.camera.setZoom(1.25, true);

    this.roomState = {
      hasSlept: false,
      sleeping: false,
      exitPromptActive: false,
      awaitingExitRelease: false,
    };
    this.hideRoomChoice(true);
    this.dialogueInput.disabled = true;
    
    // 방 상태에 따라 BGM 재생
    if (this.map?.isMorning) {
      try {
        if (this.map.isMorning()) {
          this.playRoomMorningBgm(); // 아침 상태
        } else {
          this.playRoomNightBgm(); // 밤 상태
        }
      } catch (err) {
        console.error('Room BGM 재생 오류:', err);
      }
    }
    this.dialogueInput.placeholder = '쵸로키 방에서 단서를 찾아보세요';
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

  setMode(mode, options = {}) {
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
    this.hideRoomChoice(true);
    this.sleepOverlay?.classList.add('hidden');
    this.roomState = null;
    this.paused = false;
    
    // 껌 버튼과 낙서 버튼 표시/숨김
    if (mode === MODES.DAY || mode === MODES.NIGHT) {
      this.spitGumButton?.classList.remove('hidden');
      this.graffityButton?.classList.remove('hidden');
    } else {
      this.spitGumButton?.classList.add('hidden');
      this.graffityButton?.classList.add('hidden');
      // 방으로 이동 시 낙서 모드 종료
      this.isGraffityMode = false;
      this.lastGraffityPos = null;
      this.graffityButton?.classList.remove('active');
    }
    
    // 드러눕기 버튼은 낮에만 표시
    if (mode === MODES.DAY) {
      this.lieDownButton?.classList.remove('hidden');
    } else {
      this.lieDownButton?.classList.add('hidden');
    }
    
    // 불장난 버튼은 학교에서만 표시
    if (mode === MODES.DAY || mode === MODES.NIGHT) {
      this.fireButton?.classList.remove('hidden');
    } else {
      this.fireButton?.classList.add('hidden');
    }

    if (mode === MODES.DAY || mode === MODES.NIGHT) {
      this.map = new SchoolMap();
      this.pathfinder = new Pathfinder(this.map);
    } else if (mode === MODES.ROOM) {
      this.map = new ChorokiRoomMap();
      this.pathfinder = null;
      const roomMorning = options.roomMorning ?? false;
      if (typeof this.map.setMorning === 'function') {
        this.map.setMorning(roomMorning);
      }
    }

    if (mode === MODES.DAY) {
      this.setupDayMode();
    } else if (mode === MODES.NIGHT) {
      this.setupNightMode();
    } else if (mode === MODES.ROOM) {
      this.setupRoomMode();
    }
    this.dialogueManager.setMode(mode);
    this.pendingReset = null;
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

  playRoomNightBgm() {
    if (!this.roomNightBgm || !this.musicEnabled) return;
    
    // 항상 처음부터 재생
    this.roomNightBgm.currentTime = 0;
    this.roomNightBgm.volume = 0.35; // 볼륨 35% (배경음악)
    this.roomNightBgm.play().catch(err => {
      console.error('방 밤 배경음악 재생 실패:', err);
    });
    console.log('🎶 Room Night BGM started (짱구 해질무렵)');
  }
  
  stopRoomNightBgm() {
    if (!this.roomNightBgm) return;
    
    this.roomNightBgm.pause();
    this.roomNightBgm.currentTime = 0;
    console.log('🎶 Room Night BGM stopped');
  }

  playRoomMorningBgm() {
    if (!this.roomMorningBgm || !this.musicEnabled) return;
    
    // 항상 처음부터 재생
    this.roomMorningBgm.currentTime = 0;
    // 측정값: -19.1 dB → 목표: -24 dB → -4.9 dB 조정 → 0.57배
    this.roomMorningBgm.volume = 0.57;
    this.roomMorningBgm.play().catch(err => {
      console.error('방 아침 배경음악 재생 실패:', err);
    });
    console.log('🎶 Room Morning BGM started (짱구 아침)');
  }
  
  stopRoomMorningBgm() {
    if (!this.roomMorningBgm) return;
    
    this.roomMorningBgm.pause();
    this.roomMorningBgm.currentTime = 0;
    console.log('🎶 Room Morning BGM stopped');
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

  updateRoom(dt) {
    if (!this.roomState || this.roomState.sleeping) return;
    const nearExit = this.map?.isNearExit ? this.map.isNearExit(this.player.position) : false;
    if (!nearExit && this.roomState.awaitingExitRelease) {
      this.roomState.awaitingExitRelease = false;
    }
    if (this.roomState.hasSlept && nearExit && !this.roomState.exitPromptActive && !this.roomState.awaitingExitRelease) {
      this.showRoomChoice();
    } else if ((!nearExit || this.roomState.sleeping) && this.roomState.exitPromptActive) {
      this.hideRoomChoice();
    }
  }

  handleRoomInteract() {
    if (this.mode !== MODES.ROOM || !this.roomState || this.roomState.sleeping) return;
    if (this.map?.isNearBed && this.map.isNearBed(this.player.position)) {
      this.startSleepSequence();
    }
  }

  startSleepSequence() {
    if (!this.roomState || this.roomState.sleeping) return;
    this.roomState.sleeping = true;
    this.hideRoomChoice(true);
    this.paused = true;
    
    // 방 BGM 정지
    this.stopRoomNightBgm();
    this.stopRoomMorningBgm();
    
    // 잠들기 컷씬 재생
    this.playSleepCutscene();
  }
  
  playSleepCutscene() {
    if (!this.sleepCutsceneContainer || !this.sleepCutsceneVideo) {
      // 컷씬이 없으면 기존 오버레이 방식 사용
      console.warn('잠들기 컷씬 요소가 없습니다. 기본 방식을 사용합니다.');
      this.startSleepSequenceOld();
      return;
    }
    
    // 비디오 컨테이너 표시
    this.sleepCutsceneContainer.classList.remove('hidden');
    
    // 비디오 재생
    this.sleepCutsceneVideo.currentTime = 0;
    this.sleepCutsceneVideo.play().catch(err => {
      console.error('잠들기 컷씬 재생 실패:', err);
      this.sleepCutsceneContainer.classList.add('hidden');
      this.startSleepSequenceOld();
    });
    
    // 비디오 종료 시 아침으로 전환
    const onVideoEnd = () => {
      this.sleepCutsceneContainer.classList.add('hidden');
      this.sleepCutsceneVideo.removeEventListener('ended', onVideoEnd);
      
      if (!this.roomState) return;
      this.roomState.sleeping = false;
      this.roomState.hasSlept = true;
      if (typeof this.map?.setMorning === 'function') {
        this.map.setMorning(true);
      }
      // 아침 BGM 재생
      this.playRoomMorningBgm();
      this.paused = false;
      
      console.log('🌅 아침이 되었습니다 (컷씬 종료)');
    };
    
    this.sleepCutsceneVideo.addEventListener('ended', onVideoEnd);
    
    // 스페이스바로 스킵 가능
    const skipHandler = (e) => {
      if (e.code === 'Space' && !this.sleepCutsceneContainer.classList.contains('hidden')) {
        e.preventDefault();
        this.sleepCutsceneVideo.pause();
        this.sleepCutsceneContainer.classList.add('hidden');
        this.sleepCutsceneVideo.removeEventListener('ended', onVideoEnd);
        document.removeEventListener('keydown', skipHandler);
        
        if (!this.roomState) return;
        this.roomState.sleeping = false;
        this.roomState.hasSlept = true;
        if (typeof this.map?.setMorning === 'function') {
          this.map.setMorning(true);
        }
        // 아침 BGM 재생
        this.playRoomMorningBgm();
        this.paused = false;
        
        console.log('🌅 아침이 되었습니다 (컷씬 스킵)');
      }
    };
    document.addEventListener('keydown', skipHandler);
  }
  
  startSleepSequenceOld() {
    if (!this.sleepOverlay) return;
    this.sleepOverlay.classList.remove('hidden');
    if (this.sleepOverlayText) {
      this.sleepOverlayText.textContent = '일단 자고 보자~';
    }
    
    setTimeout(() => {
      if (!this.roomState) return;
      this.roomState.sleeping = false;
      this.roomState.hasSlept = true;
      if (typeof this.map?.setMorning === 'function') {
        this.map.setMorning(true);
      }
      // 아침 BGM 재생
      this.playRoomMorningBgm();
      this.sleepOverlay?.classList.add('hidden');
      this.paused = false;
    }, 3000);
  }
  
  startLieDownSequence() {
    // 낮 모드에서만 작동
    if (this.mode !== MODES.DAY) return;
    if (this.paused) return;
    
    console.log('😴 드러눕기 시작');
    this.paused = true;
    
    // 낙서 모드 종료
    this.isGraffityMode = false;
    this.lastGraffityPos = null;
    this.graffityButton?.classList.remove('active');
    
    // 현재 줌 레벨 저장
    const originalZoom = this.camera.baseZoom;
    
    // 드러눕기 컷씬 재생
    this.playLieDownCutscene(originalZoom);
  }
  
  playLieDownCutscene(originalZoom) {
    if (!this.lieDownCutsceneContainer || !this.lieDownCutsceneVideo) {
      // 컷씬 요소가 없으면 기존 방식으로
      console.warn('드러눕기 컷씬 요소가 없습니다. 기본 애니메이션을 사용합니다.');
      this.startLieDownSequenceOld(originalZoom);
      return;
    }
    
    // 비디오 컨테이너 표시
    this.lieDownCutsceneContainer.classList.remove('hidden');
    
    // 비디오 재생
    this.lieDownCutsceneVideo.currentTime = 0;
    this.lieDownCutsceneVideo.play().catch(err => {
      console.error('드러눕기 컷씬 재생 실패:', err);
      this.lieDownCutsceneContainer.classList.add('hidden');
      this.paused = false;
      this.setMode(MODES.NIGHT);
      this.camera.setZoom(originalZoom, true);
      this.camera.setBaseZoom(originalZoom);
    });
    
    // 비디오 종료 시 밤 모드로 전환
    const onVideoEnd = () => {
      this.lieDownCutsceneContainer.classList.add('hidden');
      this.lieDownCutsceneVideo.removeEventListener('ended', onVideoEnd);
      
      // 밤 모드로 전환
      this.setMode(MODES.NIGHT);
      
      // 카메라 줌을 원래대로 복원
      this.camera.setZoom(originalZoom, true);
      this.camera.setBaseZoom(originalZoom);
      
      console.log('🌙 밤이 되었습니다 (컷씬 종료)');
    };
    
    this.lieDownCutsceneVideo.addEventListener('ended', onVideoEnd);
    
    // 스페이스바로 스킵 가능
    const skipHandler = (e) => {
      if (e.code === 'Space' && !this.lieDownCutsceneContainer.classList.contains('hidden')) {
        e.preventDefault();
        this.lieDownCutsceneVideo.pause();
        this.lieDownCutsceneContainer.classList.add('hidden');
        this.lieDownCutsceneVideo.removeEventListener('ended', onVideoEnd);
        document.removeEventListener('keydown', skipHandler);
        
        // 밤 모드로 전환
        this.setMode(MODES.NIGHT);
        
        // 카메라 줌을 원래대로 복원
        this.camera.setZoom(originalZoom, true);
        this.camera.setBaseZoom(originalZoom);
        
        console.log('🌙 밤이 되었습니다 (컷씬 스킵)');
      }
    };
    document.addEventListener('keydown', skipHandler);
  }
  
  startLieDownSequenceOld(originalZoom) {
    // 카메라를 플레이어에게 천천히 줌인 (2초에 걸쳐)
    const targetZoom = this.camera.zoom + 2.0;
    this.camera.setZoom(targetZoom, false); // 부드럽게 줌인
    
    // 즉시 오버레이 표시 시작
    if (this.lieDownOverlay) {
      this.lieDownOverlay.classList.remove('hidden');
    }
    
    // 3초 후 밤 모드로 전환하고 줌 복원
    setTimeout(() => {
      // 오버레이 숨김
      if (this.lieDownOverlay) {
        this.lieDownOverlay.classList.add('hidden');
        // 애니메이션 리셋을 위해 약간의 딜레이
        setTimeout(() => {
          if (this.lieDownOverlayText) {
            this.lieDownOverlayText.style.opacity = '0';
          }
        }, 100);
      }
      
      // 밤 모드로 전환
      this.setMode(MODES.NIGHT);
      
      // 카메라 줌을 원래대로 복원
      this.camera.setZoom(originalZoom, true);
      this.camera.setBaseZoom(originalZoom);
      
      console.log('🌙 밤이 되었습니다 (줌 복원)');
    }, 3500);
  }

  showRoomChoice() {
    if (!this.roomState || this.roomState.exitPromptActive) return;
    if (!this.roomChoice) return;
    this.roomChoice.classList.remove('hidden');
    this.roomState.exitPromptActive = true;
    this.paused = true;
  }

  hideRoomChoice(lockUntilLeave = false) {
    if (this.roomChoice) {
      this.roomChoice.classList.add('hidden');
    }
    if (!this.roomState) {
      this.paused = false;
      return;
    }
    this.roomState.exitPromptActive = false;
    if (lockUntilLeave) {
      this.roomState.awaitingExitRelease = true;
    }
    if (!this.roomState.sleeping) {
      this.paused = false;
    }
  }

  handleRoomChoice(action) {
    if (!this.roomState) return;
    if (action === 'stay') {
      this.hideRoomChoice(true);
    } else if (action === 'school') {
      this.hideRoomChoice();
      this.playSchoolCutscene();
    }
  }

  playSchoolCutscene() {
    if (!this.schoolCutsceneContainer || !this.schoolCutsceneVideo) {
      // 컷씬 요소가 없으면 바로 학교로 이동
      this.setMode(MODES.DAY);
      return;
    }
    
    // 게임 일시정지
    this.paused = true;
    
    // 방 BGM 정지
    this.stopRoomNightBgm();
    this.stopRoomMorningBgm();
    
    // 비디오 컨테이너 표시
    this.schoolCutsceneContainer.classList.remove('hidden');
    
    // 비디오 재생
    this.schoolCutsceneVideo.currentTime = 0;
    this.schoolCutsceneVideo.play().catch(err => {
      console.error('등교 컷씬 재생 실패:', err);
      this.schoolCutsceneContainer.classList.add('hidden');
      this.paused = false;
      this.setMode(MODES.DAY);
    });
    
    // 비디오 종료 시 학교로 이동
    const onVideoEnd = () => {
      this.schoolCutsceneContainer.classList.add('hidden');
      this.schoolCutsceneVideo.removeEventListener('ended', onVideoEnd);
      this.paused = false;
      this.setMode(MODES.DAY);
    };
    
    this.schoolCutsceneVideo.addEventListener('ended', onVideoEnd);
    
    // ESC 키나 클릭으로 스킵 가능
    const skipCutscene = () => {
      this.schoolCutsceneVideo.pause();
      this.schoolCutsceneContainer.classList.add('hidden');
      this.schoolCutsceneVideo.removeEventListener('ended', onVideoEnd);
      this.schoolCutsceneContainer.removeEventListener('click', skipCutscene);
      document.removeEventListener('keydown', escapeHandler);
      this.paused = false;
      this.setMode(MODES.DAY);
    };
    
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        skipCutscene();
      }
    };
    
    this.schoolCutsceneContainer.addEventListener('click', skipCutscene, { once: true });
    document.addEventListener('keydown', escapeHandler, { once: true });
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
    if (this.fireSfx && !this.fireSfx.paused) {
      this.fireSfx.pause();
      this.fireSfx.currentTime = 0;
    }
    if (this.graffityStartSfx && !this.graffityStartSfx.paused) {
      this.graffityStartSfx.pause();
      this.graffityStartSfx.currentTime = 0;
    }
    if (this.graffityLoopSfx && !this.graffityLoopSfx.paused) {
      this.graffityLoopSfx.pause();
      this.graffityLoopSfx.currentTime = 0;
    }
    if (this.graffityEndSfx && !this.graffityEndSfx.paused) {
      this.graffityEndSfx.pause();
      this.graffityEndSfx.currentTime = 0;
    }
  }
  
  stopAllMusic() {
    this.stopDayBgm();
    this.stopNightBgm();
    this.stopRoomNightBgm();
    this.stopRoomMorningBgm();
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
    this.pendingReset = { mode: MODES.ROOM, timer: 3 };
    this.messageBanner.show('모든 배터리를 모았습니다! 집으로 돌아갑니다...', 3);
    
    // 3초 후 밤 상태의 쵸로키 방으로 이동
    setTimeout(() => {
      this.setMode(MODES.ROOM, { roomMorning: false });
    }, 3200);
  }

  triggerGameOver() {
    if (this.pendingReset) return;
    this.pendingReset = { mode: MODES.ROOM, timer: 3 };
    
    // 게임오버 효과음 재생
    this.playCaughtSfx();
    this.stopChaseBgm();
    
    this.dialogueManager.speak(this.guard, '거기 누굽니까!!!', { tone: 'night', hold: 3 });
    this.messageBanner.show('거기 누굽니까!!! 경비원에게 들켰습니다.', 3);
    setTimeout(() => this.setMode(MODES.ROOM, { roomMorning: false }), 3200);
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
    
    // 낙서 모드: 플레이어가 이동 중이면 선 그리기
    if (this.isGraffityMode && (this.mode === MODES.DAY || this.mode === MODES.NIGHT)) {
      if (this.lastGraffityPos) {
        const dx = this.player.position.x - this.lastGraffityPos.x;
        const dy = this.player.position.y - this.lastGraffityPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // 일정 거리 이상 이동했을 때만 선 추가 (너무 조밀하지 않게)
        if (dist > 2) {
          this.graffities.push({
            x1: this.lastGraffityPos.x,
            y1: this.lastGraffityPos.y,
            x2: this.player.position.x,
            y2: this.player.position.y,
            state: 'normal', // normal, burning, burned
            burningStartTime: null,
          });
          this.lastGraffityPos = { ...this.player.position };
        }
      }
    }
    
    // 불타는 낙서 상태 업데이트
    const now = performance.now();
    this.graffities.forEach((graffity) => {
      if (graffity.state === 'burning' && graffity.burningStartTime) {
        // 불이 붙은 시점부터 계산
        if (now >= graffity.burningStartTime) {
          const elapsed = (now - graffity.burningStartTime) / 1000;
          if (elapsed > 10) {
            graffity.state = 'burned';
            graffity.burningStartTime = null;
          }
        }
      }
    });
    
    if (this.mode === MODES.DAY) {
      this.updateDay(dt);
    } else if (this.mode === MODES.NIGHT) {
      this.updateNight(dt);
    } else if (this.mode === MODES.ROOM) {
      this.updateRoom(dt);
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
    if (this.mode === MODES.ROOM) {
      this.dialogueInput.disabled = true;
      this.dialogueInput.placeholder = '쵸로키 방에서 단서를 찾아보세요';
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

  spitGum() {
    // 학교 모드(낮/밤)에서만 작동
    if (this.mode !== MODES.DAY && this.mode !== MODES.NIGHT) return;
    
    // 플레이어 위치에 껌 추가
    this.gums.push({
      x: this.player.position.x,
      y: this.player.position.y,
    });
    
    // 버튼 깜빡이는 효과
    if (this.spitGumButton) {
      this.spitGumButton.classList.add('flash');
      setTimeout(() => {
        this.spitGumButton.classList.remove('flash');
      }, 200);
    }
    
    // 확률적으로 사운드 재생 (90% 캌퉤, 10% 침발라놨다)
    if (this.bgmEnabled) {
      const random = Math.random();
      if (random < 0.9) {
        // 90% 확률
        this.playSpitSfx1();
      } else {
        // 10% 확률
        this.playSpitSfx2();
      }
    }
    
    console.log(`🍬 껌을 뱉었습니다! (${this.player.position.x.toFixed(0)}, ${this.player.position.y.toFixed(0)})`);
  }
  
  playSpitSfx1() {
    if (!this.spitSfx1 || !this.bgmEnabled) return;
    
    this.spitSfx1.currentTime = 0;
    this.spitSfx1.volume = 0.8;
    this.spitSfx1.play().catch(err => {
      console.error('침뱉기 효과음1 재생 실패:', err);
    });
    console.log('💦 캌퉤!');
  }
  
  playSpitSfx2() {
    if (!this.spitSfx2 || !this.bgmEnabled) return;
    
    this.spitSfx2.currentTime = 0;
    this.spitSfx2.volume = 0.8;
    this.spitSfx2.play().catch(err => {
      console.error('침뱉기 효과음2 재생 실패:', err);
    });
    console.log('💦 침 발라놨다!');
  }
  
  playFireSfx() {
    if (!this.fireSfx || !this.bgmEnabled) return;
    
    this.fireSfx.currentTime = 0;
    this.fireSfx.volume = 0.8;
    this.fireSfx.play().catch(err => {
      console.error('불 효과음 재생 실패:', err);
    });
    console.log('🔥 화르르!');
  }
  
  startGraffitySfx() {
    if (!this.bgmEnabled) return;
    
    // 루프 사운드를 미리 준비 (preload)
    if (this.graffityLoopSfx) {
      this.graffityLoopSfx.currentTime = 0;
      this.graffityLoopSfx.volume = 0.8;
      // load()를 호출해서 버퍼링 준비
      this.graffityLoopSfx.load();
    }
    
    // 아.mp3 재생 (시작 사운드)
    if (this.graffityStartSfx) {
      this.graffityStartSfx.currentTime = 0;
      this.graffityStartSfx.volume = 0.8;
      
      // 이전 이벤트 리스너 제거 (중복 방지)
      this.graffityStartSfx.onended = null;
      
      // 아.mp3가 끝나는 순간 앙.mp3 루프 시작
      this.graffityStartSfx.onended = () => {
        if (this.isGraffityMode && this.graffityLoopSfx) {
          this.graffityLoopSfx.play().catch(err => {
            console.error('낙서 루프 효과음 재생 실패:', err);
          });
          console.log('✏️ 낙서 사운드: 앙(루프) 시작');
        }
      };
      
      this.graffityStartSfx.play().catch(err => {
        console.error('낙서 시작 효과음 재생 실패:', err);
      });
    }
    
    console.log('✏️ 낙서 사운드: 아 → 앙(루프)');
  }
  
  endGraffitySfx() {
    if (!this.bgmEnabled) return;
    
    // 루프 사운드 정지
    if (this.graffityLoopSfx && !this.graffityLoopSfx.paused) {
      this.graffityLoopSfx.pause();
      this.graffityLoopSfx.currentTime = 0;
    }
    
    // 기분조아.mp3 재생 (종료 사운드)
    if (this.graffityEndSfx) {
      this.graffityEndSfx.currentTime = 0;
      this.graffityEndSfx.volume = 0.8;
      this.graffityEndSfx.play().catch(err => {
        console.error('낙서 종료 효과음 재생 실패:', err);
      });
    }
    
    console.log('✏️ 낙서 사운드: 기분조아!');
  }
  
  renderGums() {
    // 학교 모드(낮/밤)에서만 껌 렌더링
    if (this.mode !== MODES.DAY && this.mode !== MODES.NIGHT) return;
    
    // 껌 렌더링 (검정색 작은 픽셀)
    this.ctx.fillStyle = '#000000';
    this.gums.forEach((gum) => {
      this.ctx.fillRect(gum.x - 1, gum.y - 1, 2, 2); // 2x2 픽셀
    });
  }
  
  renderGraffities() {
    // 학교 모드(낮/밤)에서만 낙서 렌더링
    if (this.mode !== MODES.DAY && this.mode !== MODES.NIGHT) return;
    
    const now = performance.now();
    
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    this.graffities.forEach((line) => {
      // 상태에 따라 색상 결정
      let color = '#00ff00'; // 기본 초록색
      let lineWidth = 5;
      
      if (line.state === 'burning' && line.burningStartTime) {
        // 아직 불이 붙지 않았으면 기본 색상
        if (now < line.burningStartTime) {
          color = '#00ff00';
          lineWidth = 5;
        } else {
          // 불타는 애니메이션: 빨강-주황 깜빡임
          const elapsed = (now - line.burningStartTime) / 1000;
          const progress = elapsed / 10; // 0~1
          const flicker = Math.sin(now / 100) * 0.5 + 0.5; // 깜빡임
          
          // 빨강에서 주황으로 변화
          const r = 255;
          const g = Math.floor(100 + flicker * 50);
          const b = 0;
          color = `rgb(${r}, ${g}, ${b})`;
          
          // 선이 점점 굵어짐
          lineWidth = 5 + progress * 3;
          
          // 불꽃 효과 (파티클)
          if (Math.random() < 0.3) {
            const midX = (line.x1 + line.x2) / 2;
            const midY = (line.y1 + line.y2) / 2;
            const offsetX = (Math.random() - 0.5) * 20;
            const offsetY = (Math.random() - 0.5) * 20;
            
            this.ctx.fillStyle = `rgba(255, ${Math.floor(Math.random() * 100)}, 0, ${0.5 + Math.random() * 0.5})`;
            this.ctx.beginPath();
            this.ctx.arc(midX + offsetX, midY + offsetY, 2 + Math.random() * 3, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }
      } else if (line.state === 'burned') {
        // 타고 난 후 검정색
        color = '#000000';
        lineWidth = 6;
      }
      
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(line.x1, line.y1);
      this.ctx.lineTo(line.x2, line.y2);
      this.ctx.stroke();
    });
  }
  
  isNearGraffity() {
    // 플레이어가 낙서 근처에 있는지 체크
    const playerPos = this.player.position;
    const checkDistance = 50; // 50픽셀 이내
    
    for (let i = 0; i < this.graffities.length; i++) {
      const graffity = this.graffities[i];
      // 선분과 점 사이의 거리 계산
      const dx = graffity.x2 - graffity.x1;
      const dy = graffity.y2 - graffity.y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      if (length === 0) continue;
      
      // 선분에 대한 플레이어의 투영
      const t = Math.max(0, Math.min(1, ((playerPos.x - graffity.x1) * dx + (playerPos.y - graffity.y1) * dy) / (length * length)));
      const projX = graffity.x1 + t * dx;
      const projY = graffity.y1 + t * dy;
      
      const dist = Math.sqrt((playerPos.x - projX) ** 2 + (playerPos.y - projY) ** 2);
      
      if (dist < checkDistance) {
        return { graffity, index: i };
      }
    }
    return null;
  }
  
  findConnectedGraffities(startIndex) {
    // BFS로 연결된 모든 낙서 찾기
    const visited = new Set();
    const queue = [{ index: startIndex, distance: 0 }];
    const connected = [];
    const connectionThreshold = 10; // 10픽셀 이내면 연결된 것으로 간주
    
    while (queue.length > 0) {
      const { index, distance } = queue.shift();
      
      if (visited.has(index)) continue;
      visited.add(index);
      
      const current = this.graffities[index];
      if (!current || current.state !== 'normal') continue;
      
      connected.push({ index, distance });
      
      // 현재 선의 끝점들
      const endpoints = [
        { x: current.x1, y: current.y1 },
        { x: current.x2, y: current.y2 }
      ];
      
      // 다른 모든 낙서와의 연결 체크
      for (let i = 0; i < this.graffities.length; i++) {
        if (visited.has(i)) continue;
        
        const other = this.graffities[i];
        if (other.state !== 'normal') continue;
        
        const otherEndpoints = [
          { x: other.x1, y: other.y1 },
          { x: other.x2, y: other.y2 }
        ];
        
        // 끝점들이 가까우면 연결된 것으로 간주
        for (const ep1 of endpoints) {
          for (const ep2 of otherEndpoints) {
            const dx = ep1.x - ep2.x;
            const dy = ep1.y - ep2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < connectionThreshold) {
              // 현재 선의 길이를 거리에 추가
              const currentLength = Math.sqrt(
                (current.x2 - current.x1) ** 2 + (current.y2 - current.y1) ** 2
              );
              queue.push({ index: i, distance: distance + currentLength });
              break;
            }
          }
        }
      }
    }
    
    return connected;
  }
  
  startFire() {
    // 학교 모드에서만 작동
    if (this.mode !== MODES.DAY && this.mode !== MODES.NIGHT) return;
    
    // 낙서 근처에 있는지 체크
    const nearResult = this.isNearGraffity();
    
    if (!nearResult) {
      console.log('🔥 낙서 근처에서 사용하세요!');
      return;
    }
    
    const { graffity: nearGraffity, index: startIndex } = nearResult;
    
    if (nearGraffity.state !== 'normal') {
      console.log('🔥 이미 불을 지른 낙서입니다!');
      return;
    }
    
    // 연결된 모든 낙서 찾기
    const connectedGraffities = this.findConnectedGraffities(startIndex);
    
    // 화르르 사운드 재생
    this.playFireSfx();
    
    // 최대 거리 계산 (2초 동안 퍼지도록)
    const maxDistance = Math.max(...connectedGraffities.map(g => g.distance), 1);
    const spreadDuration = 2000; // 2초
    const now = performance.now();
    
    // 각 낙서에 불 지르기 (거리에 비례한 딜레이)
    connectedGraffities.forEach(({ index, distance }) => {
      const graffity = this.graffities[index];
      const delay = (distance / maxDistance) * spreadDuration;
      
      graffity.state = 'burning';
      graffity.burningStartTime = now + delay;
      graffity.ignitionDelay = delay;
    });
    
    console.log(`🔥 불장난 시작! ${connectedGraffities.length}개의 낙서가 불타오릅니다!`);
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
    this.renderGraffities();
    this.renderGums();
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
    if (!this.player || !this.hearingEnabled) return;
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
  schoolCutsceneContainer: document.getElementById('schoolCutsceneContainer'),
  schoolCutsceneVideo: document.getElementById('schoolCutsceneVideo'),
  lieDownCutsceneContainer: document.getElementById('lieDownCutsceneContainer'),
  lieDownCutsceneVideo: document.getElementById('lieDownCutsceneVideo'),
  sleepCutsceneContainer: document.getElementById('sleepCutsceneContainer'),
  sleepCutsceneVideo: document.getElementById('sleepCutsceneVideo'),
  bgmToggle: document.getElementById('bgmToggle'),
  musicToggle: document.getElementById('musicToggle'),
  hearingToggle: document.getElementById('hearingToggle'),
  chaseBgm: document.getElementById('chaseBgm'),
  dayBgm: document.getElementById('dayBgm'),
  nightBgm: document.getElementById('nightBgm'),
  spitGumButton: document.getElementById('spitGumButton'),
  graffityButton: document.getElementById('graffityButton'),
  lieDownButton: document.getElementById('lieDownButton'),
  fireButton: document.getElementById('fireButton'),
});

export default controller;
