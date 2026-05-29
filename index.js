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
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0x000000);
  viewportContainer.appendChild(renderer.domElement);

  camera.position.z = 25;

  createParticles();
  setupEventListeners();
  setupMobileViewport();
  updateHistoryIndicator();
  animate();
}

function createParticles() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  function sphericalDistribution(i) {
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;

    return {
      x: 8 * Math.cos(theta) * Math.sin(phi),
      y: 8 * Math.sin(theta) * Math.sin(phi),
      z: 8 * Math.cos(phi),
    };
  }

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
  const timeoutId = setTimeout(() => controller.abort(), 25000);

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
    await delay(600);

    let answer;
    try {
      answer = await fetchAiAnswer(question, [...chatHistory]);
      pushChatMessage('user', question);
      pushChatMessage('model', answer);
    } catch (e) {
      console.warn('AI failed:', e);
      answer = e.message || 'Не удалось получить ответ';
    }

    showText(answer);

    await delay(4000);
    await hideTextAsync();
    returnParticles();
    await delay(2200);
  } finally {
    setFormBusy(false);
  }
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

function startExplosion() {
  currentState = 'exploding';

  // Stop rotation
  gsap.to(particles.rotation, { x: 0, y: 0, z: 0, duration: 0.3 });

  // Explode particles outward
  const positions = particles.geometry.attributes.position.array;
  const targetPositions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const currentX = positions[i * 3];
    const currentY = positions[i * 3 + 1];
    const currentZ = positions[i * 3 + 2];

    // Calculate direction from center and push outward
    const distance = Math.sqrt(
      currentX * currentX + currentY * currentY + currentZ * currentZ,
    );
    const multiplier = 3 + Math.random() * 2;

    targetPositions[i * 3] = currentX * multiplier;
    targetPositions[i * 3 + 1] = currentY * multiplier;
    targetPositions[i * 3 + 2] = currentZ * multiplier;
  }

  // Animate explosion (slower)
  for (let i = 0; i < positions.length; i += 3) {
    gsap.to(particles.geometry.attributes.position.array, {
      [i]: targetPositions[i],
      [i + 1]: targetPositions[i + 1],
      [i + 2]: targetPositions[i + 2],
      duration: 2.0,
      ease: 'power2.out',
      onUpdate: () => {
        particles.geometry.attributes.position.needsUpdate = true;
      },
    });
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
  currentState = 'returning';

  const positions = particles.geometry.attributes.position.array;
  const targetPositions = new Float32Array(count * 3);
  const colors = particles.geometry.attributes.color.array;

  function sphericalDistribution(i) {
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;

    return {
      x: 8 * Math.cos(theta) * Math.sin(phi),
      y: 8 * Math.sin(theta) * Math.sin(phi),
      z: 8 * Math.cos(phi),
    };
  }

  for (let i = 0; i < count; i++) {
    const point = sphericalDistribution(i);

    targetPositions[i * 3] = point.x + (Math.random() - 0.5) * 0.5;
    targetPositions[i * 3 + 1] = point.y + (Math.random() - 0.5) * 0.5;
    targetPositions[i * 3 + 2] = point.z + (Math.random() - 0.5) * 0.5;

    const depth =
      Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z) / 8;
    const color = new THREE.Color();
    color.setHSL(0.5 + depth * 0.2, 0.7, 0.4 + depth * 0.3);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  // Fade in particles
  gsap.to(particles.material, {
    opacity: 0.8,
    duration: 1.5,
    ease: 'power2.in',
  });

  for (let i = 0; i < positions.length; i += 3) {
    gsap.to(particles.geometry.attributes.position.array, {
      [i]: targetPositions[i],
      [i + 1]: targetPositions[i + 1],
      [i + 2]: targetPositions[i + 2],
      duration: 2,
      ease: 'power2.inOut',
      onUpdate: () => {
        particles.geometry.attributes.position.needsUpdate = true;
      },
    });
  }

  for (let i = 0; i < colors.length; i += 3) {
    gsap.to(particles.geometry.attributes.color.array, {
      [i]: colors[i],
      [i + 1]: colors[i + 1],
      [i + 2]: colors[i + 2],
      duration: 2,
      ease: 'power2.inOut',
      onUpdate: () => {
        particles.geometry.attributes.color.needsUpdate = true;
      },
      onComplete: () => {
        if (i === colors.length - 3) {
          currentState = 'sphere';
        }
      },
    });
  }
}

function animate() {
  requestAnimationFrame(animate);

  // Rotate sphere only when in sphere state
  if (currentState === 'sphere' && particles) {
    particles.rotation.y += 0.002;
  }

  renderer.render(scene, camera);
}

init();
