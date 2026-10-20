const DEFAULTS = Object.freeze({
  refraction: 2.8,
  blur: 0.8,
  edge: 0.32,
  dispersion: 0.55,
  specular: 0.26,
});

const ARROW_SIZE = 32;
const MASK_SIZE = 128;

const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform sampler2D u_background;
uniform sampler2D u_mask;
uniform vec2 u_resolution;
uniform vec2 u_cursor;
uniform float u_cursorSize;
uniform float u_refraction;
uniform float u_blur;
uniform float u_edgeStrength;
uniform float u_dispersion;
uniform float u_specular;
uniform vec2 u_lightDirection;
uniform vec4 u_enabled;
uniform float u_specularEnabled;

in vec2 v_uv;
out vec4 outColor;

float maskValue(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture(u_mask, uv).r;
}

vec3 blurredBackground(vec2 uv, vec2 texel, float radius) {
  vec3 c = texture(u_background, uv).rgb * 0.28;
  c += texture(u_background, uv + vec2(texel.x, 0.0) * radius).rgb * 0.12;
  c += texture(u_background, uv - vec2(texel.x, 0.0) * radius).rgb * 0.12;
  c += texture(u_background, uv + vec2(0.0, texel.y) * radius).rgb * 0.12;
  c += texture(u_background, uv - vec2(0.0, texel.y) * radius).rgb * 0.12;
  c += texture(u_background, uv + texel * radius).rgb * 0.06;
  c += texture(u_background, uv - texel * radius).rgb * 0.06;
  c += texture(u_background, uv + vec2(texel.x, -texel.y) * radius).rgb * 0.06;
  c += texture(u_background, uv + vec2(-texel.x, texel.y) * radius).rgb * 0.06;
  return c;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 uv = frag / u_resolution;
  vec2 local = (frag - u_cursor) / u_cursorSize;
  float mask = maskValue(local);
  vec3 background = texture(u_background, uv).rgb;

  if (mask <= 0.001) {
    outColor = vec4(background, 1.0);
    return;
  }

  float e = 1.0 / 128.0;
  float left = maskValue(local - vec2(e, 0.0));
  float right = maskValue(local + vec2(e, 0.0));
  float top = maskValue(local - vec2(0.0, e));
  float bottom = maskValue(local + vec2(0.0, e));
  vec2 edgeGradient = vec2(right - left, bottom - top);
  vec2 lensGradient = normalize((local - vec2(0.43, 0.48)) + vec2(0.0001));
  vec2 normal = normalize(edgeGradient * 2.2 + lensGradient * 0.28 + vec2(0.0001));

  float edgeBand = clamp(length(edgeGradient) * 4.2, 0.0, 1.0);
  float lensWeight = 0.36 + edgeBand * 0.92;
  vec2 refractPixels = normal * u_refraction * lensWeight * u_enabled.x;
  vec2 refractedUv = clamp(uv + refractPixels / u_resolution, vec2(0.001), vec2(0.999));
  vec2 texel = 1.0 / u_resolution;

  vec3 glass = u_enabled.y > 0.5
    ? blurredBackground(refractedUv, texel, u_blur)
    : texture(u_background, refractedUv).rgb;

  if (u_enabled.w > 0.5 && u_dispersion > 0.0) {
    vec2 channelShift = normal * u_dispersion / u_resolution;
    glass.r = texture(u_background, refractedUv + channelShift).r;
    glass.b = texture(u_background, refractedUv - channelShift).b;
  }

  if (u_enabled.z > 0.5) {
    float fresnel = pow(edgeBand, 0.72);
    float directional = 0.55 + 0.45 * max(dot(-normal, normalize(vec2(-0.78, -0.62))), 0.0);
    glass += vec3(1.0, 1.0, 0.985) * fresnel * directional * u_edgeStrength;
    glass -= vec3(0.035, 0.025, 0.015) * edgeBand * (1.0 - directional);
  }

  if (u_specularEnabled > 0.5) {
    vec2 highlightCenter = vec2(0.27, 0.23) + u_lightDirection * 0.055;
    vec2 highlightDelta = (local - highlightCenter) / vec2(0.34, 0.22);
    float highlight = exp(-dot(highlightDelta, highlightDelta) * 3.2);
    float ridge = pow(max(dot(-normal, normalize(vec2(-0.68, -0.73) + u_lightDirection * 0.24)), 0.0), 8.0);
    glass += vec3(1.0, 0.995, 0.97) * (highlight * 0.65 + ridge * edgeBand) * u_specular;
  }

  float contour = smoothstep(0.04, 0.78, edgeBand) * 0.19;
  glass = mix(glass, vec3(0.10, 0.16, 0.20), contour);
  outColor = vec4(mix(background, glass, mask), 1.0);
}`;

const canvas = document.querySelector('#glCanvas');
const zoomCanvas = document.querySelector('#zoomCanvas');
const stage = document.querySelector('#stage');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
const zoomContext = zoomCanvas.getContext('2d');
const backgroundCanvas = document.createElement('canvas');
const backgroundContext = backgroundCanvas.getContext('2d');

const state = {
  background: 'text',
  customImage: null,
  pointer: { x: 0.48, y: 0.38 },
  targetPointer: { x: 0.48, y: 0.38 },
  velocity: { x: 0, y: 0 },
  previousPointer: { x: 0.48, y: 0.38 },
  allEnabled: true,
  lastFrameTime: performance.now(),
  frames: 0,
  fpsStart: performance.now(),
};

const controls = {
  refraction: document.querySelector('#refraction'),
  blur: document.querySelector('#blur'),
  edge: document.querySelector('#edge'),
  dispersion: document.querySelector('#dispersion'),
  specular: document.querySelector('#specular'),
};

function setStatus(text, kind = '') {
  document.querySelector('#statusText').textContent = text;
  document.querySelector('#statusDot').className = `status-dot ${kind}`.trim();
}

function failWebGL(message) {
  document.querySelector('#webglError').hidden = false;
  document.querySelector('#webglError span').textContent = message;
  setStatus('WebGL2 不可用', 'error');
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || '着色器编译失败');
  }
  return shader;
}

function createProgram() {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexShaderSource));
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || '着色器链接失败');
  }
  return program;
}

function createTexture(unit) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

async function loadArrowMask() {
  const response = await fetch('../../assets/arrow.svg', { cache: 'no-store' });
  if (!response.ok) throw new Error(`无法读取箭头 SVG：HTTP ${response.status}`);
  const source = await response.text();
  const documentSvg = new DOMParser().parseFromString(source, 'image/svg+xml');
  const sourcePath = documentSvg.querySelector('clipPath#arrowClip path');
  if (!sourcePath) throw new Error('arrow.svg 中未找到 clipPath#arrowClip');

  const pathData = sourcePath.getAttribute('d');
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MASK_SIZE}" height="${MASK_SIZE}" viewBox="0 0 64 64"><path d="${pathData}" fill="white"/></svg>`;
  const image = new Image();
  const objectUrl = URL.createObjectURL(new Blob([maskSvg], { type: 'image/svg+xml' }));
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('浏览器无法栅格化箭头遮罩'));
      image.src = objectUrl;
    });
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = MASK_SIZE;
    maskCanvas.height = MASK_SIZE;
    const context = maskCanvas.getContext('2d');
    context.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
    context.drawImage(image, 0, 0, MASK_SIZE, MASK_SIZE);
    document.querySelector('#maskSource').textContent = 'arrow.svg / arrowClip';
    return maskCanvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawBackground() {
  const width = backgroundCanvas.width;
  const height = backgroundCanvas.height;
  const ctx = backgroundContext;
  ctx.clearRect(0, 0, width, height);

  if (state.customImage) {
    const scale = Math.max(width / state.customImage.width, height / state.customImage.height);
    const drawWidth = state.customImage.width * scale;
    const drawHeight = state.customImage.height * scale;
    ctx.drawImage(state.customImage, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    return;
  }

  if (state.background === 'white') {
    ctx.fillStyle = '#f7f8fa';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#b4c0c8';
    ctx.lineWidth = 1;
    for (let x = 40; x < width; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 40; y < height; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    return;
  }

  if (state.background === 'black') {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#26333d');
    gradient.addColorStop(1, '#05080b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = Math.max(1, width / 900);
    for (let x = 45; x < width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    return;
  }

  if (state.background === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#5132bd');
    gradient.addColorStop(.48, '#198bc3');
    gradient.addColorStop(1, '#00b894');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,104,166,.75)';
    ctx.beginPath(); ctx.arc(width * .78, height * .14, height * .31, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(124,225,255,.72)';
    ctx.beginPath(); ctx.arc(width * .12, height * .89, height * .36, 0, Math.PI * 2); ctx.fill();
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#fafbfd');
  gradient.addColorStop(1, '#d6e3ec');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const unit = Math.max(1, width / 960);
  ctx.fillStyle = '#173449';
  ctx.font = `700 ${42 * unit}px "Segoe UI", sans-serif`;
  ctx.fillText('REFRACTION / 折射测试', 52 * unit, 104 * unit);
  ctx.font = `400 ${19 * unit}px "Microsoft YaHei UI", sans-serif`;
  ctx.fillText('把 32px 玻璃箭头移动到这些细文字与线条上', 55 * unit, 145 * unit);
  ctx.strokeStyle = '#326f92';
  ctx.lineWidth = 1.2 * unit;
  for (let i = 0; i < 10; i += 1) {
    const y = (190 + i * 28) * unit;
    ctx.beginPath(); ctx.moveTo(45 * unit, y); ctx.lineTo((width / unit - 45) * unit, y); ctx.stroke();
  }
  ctx.fillStyle = '#2c6f8b';
  ctx.fillRect(55 * unit, 225 * unit, 330 * unit, 54 * unit);
  ctx.fillStyle = '#fff';
  ctx.font = `650 ${19 * unit}px "Microsoft YaHei UI", sans-serif`;
  ctx.fillText('移动观察文字边缘的局部弯折', 78 * unit, 259 * unit);
  ctx.fillStyle = '#173449';
  ctx.font = `600 ${24 * unit}px "Segoe UI", sans-serif`;
  ctx.fillText('ABCDE 012345 / Liquid Glass', 500 * unit, 260 * unit);
  ctx.font = `400 ${16 * unit}px "Consolas", monospace`;
  ctx.fillText('backgroundTexture(uv + normal * offset)', 500 * unit, 302 * unit);
}

function updateBackgroundTexture(texture) {
  drawBackground();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // 片元坐标已转换为左上原点，保持 Canvas 源纹理的行序即可。
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backgroundCanvas);
}

function resize(backgroundTexture) {
  const bounds = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * dpr));
  const height = Math.max(1, Math.round(bounds.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    backgroundCanvas.width = width;
    backgroundCanvas.height = height;
    updateBackgroundTexture(backgroundTexture);
  }
  return dpr;
}

function value(name) { return Number.parseFloat(controls[name].value); }
function enabled(id) { return document.querySelector(`#${id}`).checked ? 1 : 0; }

function updateControlLabels() {
  document.querySelector('#refractionValue').textContent = `${value('refraction').toFixed(1)} px`;
  document.querySelector('#blurValue').textContent = `${value('blur').toFixed(1)} px`;
  document.querySelector('#edgeValue').textContent = value('edge').toFixed(2);
  document.querySelector('#dispersionValue').textContent = `${value('dispersion').toFixed(2)} px`;
  document.querySelector('#specularValue').textContent = value('specular').toFixed(2);
}

function installControls(backgroundTexture) {
  document.querySelectorAll('[data-background]').forEach((button) => {
    button.addEventListener('click', () => {
      state.background = button.dataset.background;
      state.customImage = null;
      document.querySelectorAll('[data-background]').forEach((item) => item.classList.toggle('active', item === button));
      updateBackgroundTexture(backgroundTexture);
    });
  });

  document.querySelector('#imageInput').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      state.customImage = await createImageBitmap(file);
      document.querySelectorAll('[data-background]').forEach((item) => item.classList.remove('active'));
      updateBackgroundTexture(backgroundTexture);
    } catch (error) {
      setStatus(`图片读取失败：${error.message}`, 'error');
    }
  });

  Object.values(controls).forEach((control) => control.addEventListener('input', updateControlLabels));
  document.querySelector('#resetDefaults').addEventListener('click', () => {
    Object.entries(DEFAULTS).forEach(([name, setting]) => { controls[name].value = setting; });
    updateControlLabels();
  });

  document.querySelector('#toggleAll').addEventListener('click', (event) => {
    state.allEnabled = !state.allEnabled;
    ['enableRefraction', 'enableBlur', 'enableEdge', 'enableDispersion', 'enableSpecular'].forEach((id) => {
      document.querySelector(`#${id}`).checked = state.allEnabled;
    });
    event.currentTarget.textContent = state.allEnabled ? '全部关闭' : '全部开启';
  });

  stage.addEventListener('pointermove', (event) => {
    const bounds = stage.getBoundingClientRect();
    state.targetPointer.x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    state.targetPointer.y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
  });
}

function updateZoom(dpr) {
  const cursorX = state.pointer.x * canvas.width;
  const cursorY = state.pointer.y * canvas.height;
  const sourceSize = ARROW_SIZE * dpr;
  const sourceX = Math.max(0, Math.min(canvas.width - sourceSize, cursorX));
  const sourceY = Math.max(0, Math.min(canvas.height - sourceSize, cursorY));
  zoomContext.imageSmoothingEnabled = false;
  zoomContext.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
  zoomContext.drawImage(canvas, sourceX, sourceY, sourceSize, sourceSize, 0, 0, zoomCanvas.width, zoomCanvas.height);
  zoomContext.strokeStyle = 'rgba(255,255,255,.7)';
  zoomContext.lineWidth = 1;
  zoomContext.strokeRect(.5, .5, zoomCanvas.width - 1, zoomCanvas.height - 1);
}

async function start() {
  if (!gl) {
    failWebGL('未能创建 WebGL2 上下文。实验页需要支持 WebGL2 的浏览器和已启用的硬件加速。');
    return;
  }

  try {
    const program = createProgram();
    gl.useProgram(program);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms = Object.fromEntries([
      'u_background', 'u_mask', 'u_resolution', 'u_cursor', 'u_cursorSize', 'u_refraction', 'u_blur',
      'u_edgeStrength', 'u_dispersion', 'u_specular', 'u_lightDirection', 'u_enabled', 'u_specularEnabled',
    ].map((name) => [name, gl.getUniformLocation(program, name)]));

    const backgroundTexture = createTexture(0);
    const maskTexture = createTexture(1);
    const maskCanvas = await loadArrowMask();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, maskCanvas);
    gl.uniform1i(uniforms.u_background, 0);
    gl.uniform1i(uniforms.u_mask, 1);

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    document.querySelector('#rendererName').textContent = renderer || 'WebGL2';
    installControls(backgroundTexture);
    updateControlLabels();
    setStatus('WebGL2 实时渲染中', 'ready');

    function frame(time) {
      const dpr = resize(backgroundTexture);
      const delta = Math.min(50, time - state.lastFrameTime) / 16.667;
      state.lastFrameTime = time;
      const smoothing = 1 - Math.pow(0.74, delta);
      state.pointer.x += (state.targetPointer.x - state.pointer.x) * smoothing;
      state.pointer.y += (state.targetPointer.y - state.pointer.y) * smoothing;
      state.velocity.x = (state.pointer.x - state.previousPointer.x) * 18;
      state.velocity.y = (state.pointer.y - state.previousPointer.y) * 18;
      state.previousPointer.x = state.pointer.x;
      state.previousPointer.y = state.pointer.y;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
      gl.uniform2f(uniforms.u_cursor, state.pointer.x * canvas.width, state.pointer.y * canvas.height);
      gl.uniform1f(uniforms.u_cursorSize, ARROW_SIZE * dpr);
      gl.uniform1f(uniforms.u_refraction, value('refraction') * dpr);
      gl.uniform1f(uniforms.u_blur, value('blur') * dpr);
      gl.uniform1f(uniforms.u_edgeStrength, value('edge'));
      gl.uniform1f(uniforms.u_dispersion, value('dispersion') * dpr);
      gl.uniform1f(uniforms.u_specular, value('specular'));
      gl.uniform2f(uniforms.u_lightDirection, state.velocity.x, state.velocity.y);
      gl.uniform4f(
        uniforms.u_enabled,
        enabled('enableRefraction'), enabled('enableBlur'), enabled('enableEdge'), enabled('enableDispersion'),
      );
      gl.uniform1f(uniforms.u_specularEnabled, enabled('enableSpecular'));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      updateZoom(dpr);

      state.frames += 1;
      if (time - state.fpsStart >= 700) {
        const fps = state.frames * 1000 / (time - state.fpsStart);
        document.querySelector('#fpsValue').textContent = `${fps.toFixed(0)} FPS`;
        state.frames = 0;
        state.fpsStart = time;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    failWebGL(error.message);
  }
}

start();
