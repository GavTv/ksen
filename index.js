let scene;
let camera;
let renderer;
let particles;
let textMesh;
const count = 15000;
const MAX_TEXT_LENGTH = 70;
const MAX_HISTORY_MESSAGES = 20;
const CHAT_STORAGE_KEY = 'ksen_chat_history';
let currentState = 'sphere';
let isAskBusy = false;
let morphAnim = null;
let chatHistory = loadChatHistory();

const morphInput = document.getElementById('morphText');
const charCount = document.getElementById('charCount');
const counter = document.querySelector('.char-counter');

morphInput.addEventListener('input', function () {
  const { length } = this.value;
  charCount.textContent = length;

  if (length >= MAX_TEXT_LENGTH - 7) {
    counter.classList.add('warning');
  } else {
    counter.classList.remove('warning');
  }
});

const inputContainer = document.querySelector('.input-container');
const viewportContainer = document.getElementById('container');

function getViewportMetrics() {
  const vv = window.visualViewport;
  if (!vv) {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetTop: 0,
      offsetLeft: 0,
    };
  }

  return {
    width: vv.width,
    height: vv.height,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
  };
}

function updateViewportLayout() {
  const { width, height, offsetTop, offsetLeft } = getViewportMetrics();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  if (renderer && camera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
  }

  if (viewportContainer) {
    viewportContainer.style.width = `${width}px`;
    viewportContainer.style.height = `${height}px`;
    viewportContainer.style.top = `${offsetTop}px`;
    viewportContainer.style.left = `${offsetLeft}px`;
  }

  if (inputContainer) {
    const keyboardGap = window.innerHeight - height - offsetTop;
    const bottom = Math.max(12, keyboardGap + 12);
    inputContainer.style.bottom = `${bottom}px`;
  }
}

function setupMobileViewport() {
  morphInput.addEventListener('focus', () => {
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      updateViewportLayout();
    });
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportLayout);
    window.visualViewport.addEventListener('scroll', updateViewportLayout);
  }

  window.addEventListener('resize', updateViewportLayout);
  updateViewportLayout();
}

function init() {
  setupEventListeners();
  setupMobileViewport();
  updateHistoryIndicator();

  if (typeof THREE === 'undefined') {
    showInitError('Не удалось загрузить 3D-библиотеку. Проверь интернет и обнови страницу.');
    return;
  }

  if (typeof gsap === 'undefined') {
    showInitError('Не удалось загрузить анимации. Обнови страницу.');
    return;
  }

  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x000000);
    renderer.domElement.style.pointerEvents = 'none';
    viewportContainer.appendChild(renderer.domElement);

    camera.position.z = 25;

    createParticles();
    updateViewportLayout();
    animate();
  } catch (e) {
    console.error('3D init failed:', e);
    showInitError('Сфера не запустилась. Попробуй обновить страницу.');
  }
}

function showInitError(message) {
  if (!viewportContainer) return;
  viewportContainer.innerHTML = `<p class="init-error">${message}</p>`;
}

function showFallbackAnswer(text) {
  if (!viewportContainer) return;

  let el = document.getElementById('fallbackAnswer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fallbackAnswer';
    el.className = 'fallback-answer';
    viewportContainer.appendChild(el);
  }

  el.textContent = text;
  el.hidden = false;
}

function hideFallbackAnswer() {
  const el = document.getElementById('fallbackAnswer');
  if (el) el.hidden = true;
}

function createParticles() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const point = sphericalDistribution(i);

    positions[i * 3] = point.x + (Math.random() - 0.5) * 0.5;
    positions[i * 3 + 1] = point.y + (Math.random() - 0.5) * 0.5;
    positions[i * 3 + 2] = point.z + (Math.random() - 0.5) * 0.5;

    const color = new THREE.Color();
    const depth =
      Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z) / 8;
    color.setHSL(0.5 + depth * 0.2, 0.7, 0.4 + depth * 0.3);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  });

  if (particles) scene.remove(particles);
  particles = new THREE.Points(geometry, material);
  particles.rotation.set(0, 0, 0);
  scene.add(particles);
}

function loadChatHistory() {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChatHistory() {
  sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
}

function pushChatMessage(role, text) {
  chatHistory.push({ role, text });
  if (chatHistory.length > MAX_HISTORY_MESSAGES) {
    chatHistory = chatHistory.slice(-MAX_HISTORY_MESSAGES);
  }
  saveChatHistory();
  updateHistoryIndicator();
}

function clearChatHistory() {
  chatHistory = [];
  sessionStorage.removeItem(CHAT_STORAGE_KEY);
  updateHistoryIndicator();
}

function updateHistoryIndicator() {
  const el = document.getElementById('historyCount');
  if (!el) return;
  const turns = Math.floor(chatHistory.length / 2);
  el.textContent = turns > 0 ? `${turns} в диалоге` : '';
}

function getApiBase() {
  const { hostname, port, protocol } = window.location;

  if (protocol === 'file:') {
    return 'http://localhost:8080';
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (port === '8080') return '';
    return `${protocol}//${hostname}:8080`;
  }

  if (hostname === 'ksenus.ru' || hostname === 'www.ksenus.ru') {
    return 'https://ksen.onrender.com';
  }

  return '';
}

function getRequestMeta() {
  return {
    ua: navigator.userAgent,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hideTextAsync() {
  return new Promise((resolve) => {
    if (!textMesh) {
      resolve();
      return;
    }

    gsap.to(textMesh.material, {
      opacity: 0,
      duration: 0.8,
      ease: 'power2.in',
      onComplete: () => {
        disposeTextMesh();
        resolve();
      },
    });
  });
}

async function fetchAiAnswer(question, history, attempt = 1) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(`${getApiBase()}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: question,
        history,
        meta: getRequestMeta(),
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.retryable && attempt < 2) {
        showText('Секунду…');
        await delay(1200);
        return fetchAiAnswer(question, history, attempt + 1);
      }
      throw new Error(data.error || 'AI request failed');
    }

    return data.answer;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Ответ занял слишком много времени. Попробуй ещё раз.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

function setFormBusy(busy) {
  isAskBusy = busy;
  morphInput.disabled = busy;
  document.getElementById('typeBtn').disabled = busy;
}

function clearInput() {
  morphInput.value = '';
  charCount.textContent = '0';
  counter.classList.remove('warning');
}

async function runAskFlow(question) {
  if (isAskBusy) return;

  setFormBusy(true);
  clearInput();

  try {
    startExplosion();

    let answer;
    try {
      answer = await fetchAiAnswer(question, [...chatHistory]);
      pushChatMessage('user', question);
      pushChatMessage('model', answer);
    } catch (e) {
      console.warn('AI failed:', e);
      answer = e.message || 'Не удалось получить ответ';
    }

    if (particles) {
      await waitForMorphAnim();
    } else {
      await delay(300);
    }

    if (particles) {
      showText(answer);
      await delay(4000);
      await hideTextAsync();
      returnParticles();
      await waitForMorphAnim();
    } else {
      showFallbackAnswer(answer);
      await delay(4000);
      hideFallbackAnswer();
    }
  } finally {
    setFormBusy(false);
  }
}

function waitForMorphAnim() {
  if (!morphAnim?.active) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    morphAnim.onComplete = resolve;
  });
}

function setupEventListeners() {
  const typeBtn = document.getElementById('typeBtn');
  const input = document.getElementById('morphText');

  function submitQuestion() {
    const text = input.value.trim();
    if (text) runAskFlow(text);
  }

  typeBtn.addEventListener('click', submitQuestion);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuestion();
    }
  });

  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    clearChatHistory();
  });
}

function startMorphAnim({ duration, ease, updatePosition, updateColor, onComplete }) {
  if (morphAnim?.tween) {
    morphAnim.tween.kill();
  }

  const nextAnim = {
    active: true,
    t: 0,
    fromPositions: updatePosition
      ? new Float32Array(particles.geometry.attributes.position.array)
      : null,
    toPositions: updatePosition ? new Float32Array(count * 3) : null,
    fromColors: updateColor ? new Float32Array(particles.geometry.attributes.color.array) : null,
    toColors: updateColor ? new Float32Array(count * 3) : null,
    updatePosition,
    updateColor,
    onComplete: null,
    tween: null,
  };

  nextAnim.tween = gsap.to(nextAnim, {
    t: 1,
    duration,
    ease,
    onComplete: () => {
      nextAnim.active = false;
      nextAnim.onComplete?.();
      nextAnim.onComplete = null;
      onComplete?.();
    },
  });

  morphAnim = nextAnim;
  return morphAnim;
}

function startExplosion() {
  if (!particles) return;

  currentState = 'exploding';

  gsap.to(particles.rotation, { x: 0, y: 0, z: 0, duration: 0.3 });

  const positions = particles.geometry.attributes.position.array;
  const morph = startMorphAnim({
    duration: 2,
    ease: 'power2.out',
    updatePosition: true,
    updateColor: false,
  });

  for (let i = 0; i < count; i++) {
    const multiplier = 3 + Math.random() * 2;
    morph.toPositions[i * 3] = positions[i * 3] * multiplier;
    morph.toPositions[i * 3 + 1] = positions[i * 3 + 1] * multiplier;
    morph.toPositions[i * 3 + 2] = positions[i * 3 + 2] * multiplier;
  }

  gsap.to(particles.material, {
    opacity: 0,
    duration: 1.2,
    ease: 'power2.out',
  });
}

function disposeTextMesh() {
  if (!textMesh) return;
  scene.remove(textMesh);
  textMesh.geometry.dispose();
  textMesh.material.map?.dispose();
  textMesh.material.dispose();
  textMesh = null;
}

function drawTextOnCanvas(ctx, lines, width, fontSize, lineHeight, padding) {
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';

  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, padding + lineHeight / 2 + index * lineHeight);
  });
}

function showText(text) {
  if (textMesh) {
    disposeTextMesh();
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const isMobile = window.innerWidth < 640;
  const fontSize = isMobile ? 52 : 72;
  const lineHeight = fontSize * 1.35;
  const padding = 36;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  ctx.font = `bold ${fontSize}px Arial, sans-serif`;

  const maxCharsPerLine = isMobile ? 28 : 36;

  function wrapText(text) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  const lines = wrapText(text);

  // Calculate canvas dimensions
  let maxLineWidth = 0;
  lines.forEach((line) => {
    const { width } = ctx.measureText(line);
    if (width > maxLineWidth) maxLineWidth = width;
  });

  const logicalW = maxLineWidth + padding * 2;
  const logicalH = lines.length * lineHeight + padding * 2;

  canvas.width = Math.ceil(logicalW * dpr);
  canvas.height = Math.ceil(logicalH * dpr);
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, logicalW, logicalH);
  drawTextOnCanvas(ctx, lines, logicalW, fontSize, lineHeight, padding);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });

  // Адаптивный размер плоскости в зависимости от количества линий
  const aspectRatio = canvas.width / canvas.height;

  // Чем больше линий, тем больше плоскость
  let baseWidth;
  if (isMobile) {
    baseWidth = lines.length > 1 ? 10 : 8;
  } else {
    baseWidth = lines.length > 1 ? 14 : 12;
  }

  const planeWidth = baseWidth;
  const planeHeight = planeWidth / aspectRatio;

  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
  textMesh = new THREE.Mesh(geometry, material);
  textMesh.renderOrder = 10;
  textMesh.position.set(0, 0, 0);

  scene.add(textMesh);

  gsap.to(textMesh.material, {
    opacity: 1,
    duration: 0.8,
    ease: 'power2.out',
  });
}

function returnParticles() {
  if (!particles) return;

  currentState = 'returning';

  const morph = startMorphAnim({
    duration: 2,
    ease: 'power2.inOut',
    updatePosition: true,
    updateColor: true,
    onComplete: () => {
      currentState = 'sphere';
    },
  });

  for (let i = 0; i < count; i++) {
    const point = sphericalDistribution(i);

    morph.toPositions[i * 3] = point.x + (Math.random() - 0.5) * 0.5;
    morph.toPositions[i * 3 + 1] = point.y + (Math.random() - 0.5) * 0.5;
    morph.toPositions[i * 3 + 2] = point.z + (Math.random() - 0.5) * 0.5;

    const depth =
      Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z) / 8;
    const color = new THREE.Color();
    color.setHSL(0.5 + depth * 0.2, 0.7, 0.4 + depth * 0.3);

    morph.toColors[i * 3] = color.r;
    morph.toColors[i * 3 + 1] = color.g;
    morph.toColors[i * 3 + 2] = color.b;
  }

  gsap.to(particles.material, {
    opacity: 0.8,
    duration: 1.5,
    ease: 'power2.in',
  });
}

function sphericalDistribution(i) {
  const phi = Math.acos(-1 + (2 * i) / count);
  const theta = Math.sqrt(count * Math.PI) * phi;

  return {
    x: 8 * Math.cos(theta) * Math.sin(phi),
    y: 8 * Math.sin(theta) * Math.sin(phi),
    z: 8 * Math.cos(phi),
  };
}

function applyMorphAnim() {
  if (!morphAnim?.active || !particles) return;

  const positions = particles.geometry.attributes.position.array;
  const colors = particles.geometry.attributes.color.array;
  const { t, fromPositions, toPositions, fromColors, toColors, updatePosition, updateColor } =
    morphAnim;

  if (updatePosition) {
    for (let i = 0; i < positions.length; i += 1) {
      positions[i] = fromPositions[i] + (toPositions[i] - fromPositions[i]) * t;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  if (updateColor) {
    for (let i = 0; i < colors.length; i += 1) {
      colors[i] = fromColors[i] + (toColors[i] - fromColors[i]) * t;
    }
    particles.geometry.attributes.color.needsUpdate = true;
  }
}

function animate() {
  requestAnimationFrame(animate);

  applyMorphAnim();

  if (currentState === 'sphere' && particles) {
    particles.rotation.y += 0.002;
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

init();
