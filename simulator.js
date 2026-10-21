/** Build the main interactive training cockpit. Flight dynamics are intentionally game-like. */
export function initializeSimulator(container, { onExit = () => {}, onInstrumentSelect = () => {} } = {}) {
  if (!container) return null;
  const canvasHost = container.querySelector('#simulator-canvas');
  const root = container;
  const status = root.querySelector('#sim-state');
  const loading = root.querySelector('#sim-loading');
  const pauseOverlay = root.querySelector('#sim-pause-overlay');
  const instruments = [
    { id: 'airspeed', title: 'Указатель воздушной скорости', purpose: 'Показывает скорость самолёта относительно окружающего воздуха.', example: 'В этой модели скорость плавно меняется с положением носа; смотри, как её изменение отражается на указателе.', get: (f) => `${Math.round(f.speed)} kt` },
    { id: 'attitude', title: 'Авиагоризонт', purpose: 'Показывает положение самолёта относительно линии горизонта: тангаж и крен.', example: 'Нажми W или S, затем A или D: символ самолёта и горизонт покажут изменение положения.', get: (f) => `Тангаж ${Math.round(f.pitch)}° · крен ${Math.round(f.bank)}°` },
    { id: 'altimeter', title: 'Высотомер', purpose: 'Показывает высоту самолёта над выбранным уровнем отсчёта.', example: 'При наборе или снижении высота постепенно меняется вместе с вертикальной скоростью.', get: (f) => `${Math.round(f.altitude)} ft` },
    { id: 'vertical-speed', title: 'Индикатор вертикальной скорости', purpose: 'Показывает темп набора высоты или снижения.', example: 'Тангаж вверх даёт положительную вертикальную скорость в упрощённой модели, вниз — отрицательную.', get: (f) => `${f.verticalSpeed > 0 ? '+' : ''}${Math.round(f.verticalSpeed * 100)} ft/min` },
    { id: 'compass', title: 'Компас', purpose: 'Показывает направление, в котором ориентирован самолёт.', example: 'Удерживай крен влево или вправо: курс будет меняться плавно, пока самолёт наклонён.', get: (f) => `${String(Math.round(f.heading + 360) % 360).padStart(3, '0')}°` },
    { id: 'rpm', title: 'Индикатор оборотов двигателя', purpose: 'Показывает частоту вращения двигателя.', example: 'В этой учебной сцене обороты отображаются как стабильный базовый параметр двигателя.', get: (f) => `${Math.round(f.rpm)} RPM` },
    { id: 'controls', title: 'Штурвал и педали', purpose: 'Штурвал задаёт команды по тангажу и крену; педали связаны с управлением рысканием.', example: 'Используй W/S и A/D: штурвал в кабине отклоняется вслед за командами. Экранные стрелки доступны на телефоне.', get: (f) => `Тангаж ${Math.round(f.pitch)}° · крен ${Math.round(f.bank)}°` },
  ];
  let disposed = false;
  let active = true;
  let paused = false;
  let renderer, scene, camera, resizeObserver, animationId, lastFrame = 0;
  let cameraYaw = 0, cameraPitch = 0.03, cameraDistance = 9.3;
  let dragPointer = null;
  let hovered = null;
  const held = new Set();
  const meshes = new Map();
  const flight = { pitch: 0, bank: 0, heading: 90, altitude: 2500, speed: 95, verticalSpeed: 0, rpm: 2200 };
  const defaultFlight = { ...flight };
  let yoke;
  let horizonGroup;
  let gaugeNeedles = new Map();

  const setState = (label, kind = '') => { status.textContent = label; status.dataset.state = kind; };
  const setPaused = (value) => {
    paused = Boolean(value);
    pauseOverlay.classList.toggle('hidden', !paused);
    const button = root.querySelector('[data-sim-action="pause"]');
    button.textContent = paused ? 'Продолжить' : 'Пауза';
    setState(paused ? 'ПАУЗА' : active ? 'В ПОЛЁТЕ' : 'ПРИОСТАНОВЛЕН', paused ? 'paused' : 'ready');
    held.clear();
  };
  const setInfo = (instrument, notify = false) => {
    if (!instrument) return;
    root.querySelector('#sim-info-title').textContent = instrument.title;
    root.querySelector('#sim-info-purpose').textContent = instrument.purpose;
    root.querySelector('#sim-info-reading').textContent = instrument.get(flight);
    root.querySelector('#sim-info-example').textContent = instrument.example;
    if (notify) onInstrumentSelect({ ...instrument, reading: instrument.get(flight) });
  };
  const updateCamera = (THREE) => {
    const target = new THREE.Vector3(0, 0.82, -2.05);
    const cp = Math.cos(cameraPitch);
    camera.position.set(target.x + cameraDistance * Math.sin(cameraYaw) * cp, target.y + cameraDistance * Math.sin(cameraPitch), target.z + cameraDistance * Math.cos(cameraYaw) * cp);
    camera.lookAt(target);
  };
  const makeMaterial = (THREE, color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.12, ...options });
  const box = (THREE, parent, size, position, material, rotation = null) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  };
  const createGaugeTexture = (THREE, item) => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#172536'; ctx.beginPath(); ctx.arc(256, 256, 249, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c6d7e5'; ctx.lineWidth = 8;
    for (let i = 0; i <= 10; i++) { const a = (-Math.PI * 0.78) + (i / 10) * Math.PI * 1.56; ctx.beginPath(); ctx.moveTo(256 + Math.cos(a) * 184, 256 + Math.sin(a) * 184); ctx.lineTo(256 + Math.cos(a) * 218, 256 + Math.sin(a) * 218); ctx.stroke(); }
    ctx.fillStyle = '#e9f5ff'; ctx.textAlign = 'center'; ctx.font = '700 49px Arial'; ctx.fillText(item.id === 'airspeed' ? 'ASI' : item.id === 'attitude' ? 'AI' : item.id === 'altimeter' ? 'ALT' : item.id === 'vertical-speed' ? 'VSI' : item.id === 'compass' ? 'HDG' : item.id === 'rpm' ? 'RPM' : 'YOKE', 256, 275);
    ctx.fillStyle = '#79cdec'; ctx.font = '600 27px Arial'; ctx.fillText(item.id === 'airspeed' ? 'KNOTS' : item.id === 'altimeter' ? 'ALTITUDE' : item.id === 'vertical-speed' ? 'FT/MIN' : item.id === 'compass' ? 'HEADING' : item.id === 'rpm' ? 'ENGINE' : item.id === 'controls' ? 'CONTROL' : 'ATTITUDE', 256, 326);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  };
  const buildScene = (THREE) => {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#83b5ce'); scene.fog = new THREE.Fog('#a8c5d0', 19, 55);
    camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100); updateCamera(THREE);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    canvasHost.querySelector('#sim-loading')?.remove(); canvasHost.prepend(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#e2f5ff', '#344153', 2.0));
    const sunlight = new THREE.DirectionalLight('#fff1d6', 2.4); sunlight.position.set(-5, 8, 4); scene.add(sunlight);

    // Outside scenery: a distant horizon with low terrain, shifted by the simple flight model.
    horizonGroup = new THREE.Group(); scene.add(horizonGroup);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(42, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), makeMaterial(THREE, '#75afd0', { side: THREE.BackSide, roughness: 1 })); sky.position.set(0, -2, -18); horizonGroup.add(sky);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 75), makeMaterial(THREE, '#647b62', { side: THREE.DoubleSide, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -6.3, -20); horizonGroup.add(ground);
    const ridgeMat = makeMaterial(THREE, '#506b68', { roughness: 1 });
    for (let i = 0; i < 9; i++) { const hill = new THREE.Mesh(new THREE.ConeGeometry(2.8 + (i % 3), 3.4 + (i % 4), 5), ridgeMat); hill.position.set(-15 + i * 3.8, -4.4, -23 - (i % 2) * 2); horizonGroup.add(hill); }
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#eef8fb', transparent: true, opacity: 0.8, roughness: 1 });
    for (const [x, y, z, scale] of [[-7, 3.3, -17, 1.2], [6, 4.4, -22, 1.6], [1, 2.7, -16, .9]]) { const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), cloudMat); cloud.position.set(x, y, z); cloud.scale.set(scale * 1.7, scale * .42, scale * .7); horizonGroup.add(cloud); }

    // Cabin shell, side rails, windscreen and front instrument fascia.
    const cabin = new THREE.Group(); scene.add(cabin);
    const shellMat = makeMaterial(THREE, '#26384b', { metalness: .24, roughness: .52 });
    const trimMat = makeMaterial(THREE, '#60758a', { metalness: .45, roughness: .38 });
    box(THREE, cabin, [8.4, .38, 12], [0, -1.15, 0], shellMat);
    box(THREE, cabin, [.35, 2.7, 9], [-4.05, .05, 1], shellMat);
    box(THREE, cabin, [.35, 2.7, 9], [4.05, .05, 1], shellMat);
    box(THREE, cabin, [8.2, .34, .45], [0, 1.3, 2.9], trimMat);
    box(THREE, cabin, [8.2, .34, .45], [0, 1.3, -3.2], trimMat);
    box(THREE, cabin, [.3, 3.2, .3], [-4, 2.7, -3.0], trimMat);
    box(THREE, cabin, [.3, 3.2, .3], [4, 2.7, -3.0], trimMat);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 3.15), new THREE.MeshPhysicalMaterial({ color: '#9de1f4', transparent: true, opacity: .16, roughness: .08, metalness: .1, side: THREE.DoubleSide }));
    glass.position.set(0, 2.75, -3.05); cabin.add(glass);
    // Forward windshield bow and overhead frame make the glass readable in depth.
    const barGeo = new THREE.CylinderGeometry(.055, .055, 3.5, 10);
    for (const x of [-2.65, 0, 2.65]) { const bar = new THREE.Mesh(barGeo, trimMat); bar.position.set(x, 2.75, -3.18); cabin.add(bar); }
    const overhead = box(THREE, cabin, [8.2, .24, .42], [0, 4.34, -2.98], shellMat); overhead.rotation.x = -.1;

    const panel = box(THREE, cabin, [8, 2.35, .65], [0, .2, -1.3], makeMaterial(THREE, '#283c51', { metalness: .28, roughness: .6 }));
    panel.rotation.x = -.08;
    const gaugePositions = [[-2.7, .63], [-.9, .63], [.9, .63], [2.7, .63], [-1.45, -.32], [1.45, -.32]];
    const controlTargets = [];
    instruments.slice(0, 6).forEach((item, index) => {
      const [x, y] = gaugePositions[index];
      const group = new THREE.Group(); group.position.set(x, y, - .91); cabin.add(group);
      const rimMat = makeMaterial(THREE, '#91a5b7', { metalness: .82, roughness: .28, emissive: '#000000' });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.62, .075, 12, 48), rimMat); group.add(rim);
      const face = new THREE.Mesh(new THREE.CircleGeometry(.57, 48), new THREE.MeshBasicMaterial({ map: createGaugeTexture(THREE, item) })); group.add(face);
      const needleShape = new THREE.Shape(); needleShape.moveTo(-.035, -.09); needleShape.lineTo(0, .38); needleShape.lineTo(.035, -.09); needleShape.lineTo(-.035, -.09);
      const needle = new THREE.Mesh(new THREE.ShapeGeometry(needleShape), new THREE.MeshBasicMaterial({ color: '#ff665d', side: THREE.DoubleSide })); needle.position.z = .025; group.add(needle);
      const hub = new THREE.Mesh(new THREE.CircleGeometry(.065, 20), new THREE.MeshBasicMaterial({ color: '#f5f8fc' })); hub.position.z = .03; group.add(hub);
      const hit = new THREE.Mesh(new THREE.CircleGeometry(.72, 32), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.z = .04; hit.userData.instrument = item; group.add(hit); meshes.set(item.id, { hit, rimMat, needle });
      for (const dx of [-.49, .49]) for (const dy of [-.49, .49]) { const screw = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 8), trimMat); screw.position.set(dx, dy, .055); group.add(screw); }
    });
    // Control column and wheel in front of the learner.
    yoke = new THREE.Group(); yoke.position.set(0, -.63, .15); cabin.add(yoke);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(.11, .16, 1.25, 16), trimMat); column.position.set(0, -.33, .08); yoke.add(column);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(.59, .095, 12, 48), makeMaterial(THREE, '#202c38', { metalness: .58, roughness: .34 })); wheel.position.set(0, .25, .28); yoke.add(wheel);
    wheel.userData.instrument = instruments.find((item) => item.id === 'controls'); controlTargets.push(wheel);
    box(THREE, yoke, [.15, .15, .5], [0, .25, .28], trimMat);
    for (const x of [-1.7, 1.7]) { const pedalStem = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, .72, 12), trimMat); pedalStem.rotation.x = -.28; pedalStem.position.set(x, - .79, .2); cabin.add(pedalStem); const pedal = box(THREE, cabin, [.72, .16, .24], [x, -1.08, .32], shellMat); pedal.rotation.z = x < 0 ? -.08 : .08; pedal.userData.instrument = instruments.find((item) => item.id === 'controls'); controlTargets.push(pedal); }
    // Console details and seat edges add cabin depth without external assets.
    box(THREE, cabin, [1.4, .32, 1.8], [0, -1.02, 1.7], makeMaterial(THREE, '#1b2b3b'));
    for (const x of [-3.83, 3.83]) box(THREE, cabin, [.16, .15, 7.5], [x, 1.16, .2], trimMat);

    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const resize = () => { if (!renderer || disposed) return; const rect = canvasHost.getBoundingClientRect(); const w = Math.max(1, rect.width), h = Math.max(1, rect.height); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvasHost); resize();
    const pointerMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      if (dragPointer === event.pointerId) { cameraYaw = THREE.MathUtils.clamp(cameraYaw - event.movementX * .004, -1.0, 1.0); cameraPitch = Math.max(-.12, Math.min(.42, cameraPitch + event.movementY * .003)); updateCamera(THREE); return; }
      raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects([...meshes.values()].map((item) => item.hit).concat(controlTargets), false)[0];
      const next = hit?.object.userData.instrument || null;
      if (hovered !== next) { const previousRing = hovered && meshes.get(hovered.id)?.rimMat; if (previousRing) previousRing.emissive.set('#000000'); hovered = next; const nextRing = hovered && meshes.get(hovered.id)?.rimMat; if (nextRing) nextRing.emissive.set('#38bde8'); renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab'; }
    };
    const pointerDown = (event) => {
      if (event.button === 0) { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects([...meshes.values()].map((item) => item.hit).concat(controlTargets), false)[0]; if (hit) { setInfo(hit.object.userData.instrument, true); return; } }
      dragPointer = event.pointerId; renderer.domElement.setPointerCapture(event.pointerId); renderer.domElement.style.cursor = 'grabbing';
    };
    const pointerUp = () => { dragPointer = null; if (renderer?.domElement) renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab'; };
    const wheelZoom = (event) => { event.preventDefault(); cameraDistance = Math.max(7.1, Math.min(12.2, cameraDistance + event.deltaY * .006)); updateCamera(THREE); };
    renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointercancel', pointerUp); renderer.domElement.addEventListener('wheel', wheelZoom, { passive: false });
    const keyDown = (event) => {
      if (!active || event.target.matches('input,textarea,select')) return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', ' '].includes(key)) event.preventDefault();
      if (key === 'escape') { onExit(); return; }
      if (key === ' ' && !event.repeat) { setPaused(!paused); return; }
      if (!paused && ['w', 'a', 's', 'd', 'q', 'e'].includes(key)) held.add(key);
    };
    const keyUp = (event) => held.delete(event.key.toLowerCase());
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
    const updateReadouts = () => {
      root.querySelector('#sim-pitch-value').textContent = `${Math.round(flight.pitch)}°`;
      root.querySelector('#sim-bank-value').textContent = `${Math.round(flight.bank)}°`;
      root.querySelector('#sim-heading-value').textContent = `${String(Math.round(flight.heading + 360) % 360).padStart(3, '0')}°`;
      root.querySelector('#sim-speed-value').textContent = `${Math.round(flight.speed)} kt`;
      root.querySelector('#sim-altitude-value').textContent = `${Math.round(flight.altitude)} ft`;
      for (const item of instruments.slice(0, 6)) { const { needle } = meshes.get(item.id); if (item.id === 'airspeed') needle.rotation.z = (flight.speed - 95) * .018; else if (item.id === 'attitude') { needle.rotation.z = -flight.bank * Math.PI / 180; needle.position.y = flight.pitch * .008; } else if (item.id === 'altimeter') needle.rotation.z = -(flight.altitude % 10000) / 10000 * Math.PI * 2; else if (item.id === 'vertical-speed') needle.rotation.z = -flight.verticalSpeed * .045; else if (item.id === 'compass') needle.rotation.z = -flight.heading * Math.PI / 180; else if (item.id === 'rpm') needle.rotation.z = -(flight.rpm - 1800) * .001; }
      const selected = instruments.find((item) => item.title === root.querySelector('#sim-info-title').textContent); if (selected) root.querySelector('#sim-info-reading').textContent = selected.get(flight);
      yoke.rotation.x = THREE.MathUtils.degToRad(-flight.pitch * .7); yoke.rotation.z = THREE.MathUtils.degToRad(-flight.bank * .58);
      horizonGroup.rotation.z = THREE.MathUtils.degToRad(-flight.bank * .48); horizonGroup.position.y = -flight.pitch * .045;
    };
    const animate = (time) => {
      if (disposed) return;
      animationId = requestAnimationFrame(animate);
      if (!active) return;
      const dt = Math.min(.05, Math.max(0, (time - lastFrame) / 1000)); lastFrame = time;
      if (!paused) {
        const pitchInput = (held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0);
        const bankInput = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
        flight.pitch = THREE.MathUtils.clamp(flight.pitch + pitchInput * 24 * dt - flight.pitch * .32 * dt, -24, 24);
        flight.bank = THREE.MathUtils.clamp(flight.bank + bankInput * 48 * dt - flight.bank * .22 * dt, -48, 48);
        flight.heading = ((flight.heading + Math.sin(THREE.MathUtils.degToRad(flight.bank)) * 20 * dt + 360) % 360);
        flight.verticalSpeed = flight.pitch * 1.6;
        flight.altitude = THREE.MathUtils.clamp(flight.altitude + flight.verticalSpeed * 60 * dt, 500, 12000);
        flight.speed = THREE.MathUtils.clamp(95 - flight.pitch * .72, 55, 145);
        if (held.has('q')) cameraYaw = THREE.MathUtils.clamp(cameraYaw - .8 * dt, -1.0, 1.0); if (held.has('e')) cameraYaw = THREE.MathUtils.clamp(cameraYaw + .8 * dt, -1.0, 1.0);
        if (held.has('q') || held.has('e')) updateCamera(THREE);
      }
      updateReadouts(); renderer.render(scene, camera);
    };
    animate(performance.now());
    canvasHost.addEventListener('pointerdown', () => canvasHost.focus?.());
    canvasHost.tabIndex = 0;
    root.querySelectorAll('[data-flight-key]').forEach((button) => {
      const key = button.dataset.flightKey;
      const down = (event) => { event.preventDefault(); if (!paused) held.add(key); button.classList.add('pressed'); };
      const up = () => { held.delete(key); button.classList.remove('pressed'); };
      button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointerleave', up); button.addEventListener('pointercancel', up);
      button._simCleanup = () => { button.removeEventListener('pointerdown', down); button.removeEventListener('pointerup', up); button.removeEventListener('pointerleave', up); button.removeEventListener('pointercancel', up); };
    });
    root.querySelectorAll('[data-sim-action]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.simAction === 'pause') setPaused(!paused);
      if (button.dataset.simAction === 'exit') onExit();
      if (button.dataset.simAction === 'restart') { Object.assign(flight, defaultFlight); cameraYaw = 0; cameraPitch = .03; cameraDistance = 9.3; updateCamera(THREE); setPaused(false); setInfo(instruments[0]); }
    }));
    setInfo(instruments[0]); if (active) setState('В ПОЛЁТЕ', 'ready'); else setPaused(true);
    return { ready: true, setActive(value) { active = Boolean(value); if (!active) setPaused(true); else { resize(); lastFrame = performance.now(); } }, setPaused, dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(animationId); resizeObserver?.disconnect(); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp);
      renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointercancel', pointerUp); renderer.domElement.removeEventListener('wheel', wheelZoom);
      root.querySelectorAll('[data-flight-key]').forEach((button) => button._simCleanup?.()); renderer.dispose(); scene.traverse((object) => { object.geometry?.dispose?.(); if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material?.dispose?.(); });
    } };
  };
  const controls = root.querySelectorAll('[data-sim-action]');
  controls.forEach((button) => button.disabled = true);
  const loadScene = () => import('three').then((THREE) => {
    if (disposed) return;
    const controller = buildScene(THREE);
    controls.forEach((button) => button.disabled = false);
    root._simController = controller;
  }).catch((error) => {
    if (disposed) return;
    loading.innerHTML = `<b>Не удалось загрузить 3D-кабину</b><small>Проверь подключение к интернету и открой симулятор снова. ${String(error?.message || '').replace(/[<>&]/g, '')}</small><button type="button" data-sim-retry>Повторить загрузку</button>`;
    loading.classList.add('sim-load-error'); setState('ОШИБКА ЗАГРУЗКИ', 'error');
    loading.querySelector('[data-sim-retry]').addEventListener('click', () => { loading.innerHTML = '<span class="sim-spinner"></span><b>Загружаем 3D-кабину…</b><small>Подготавливаем приборы и сцену</small>'; loading.classList.remove('sim-load-error'); loadScene(); });
  });
  loadScene();
  return { ready: false, setActive(value) { active = Boolean(value); if (root._simController) root._simController.setActive(value); }, setPaused(value) { root._simController?.setPaused(value); }, dispose() { if (disposed) return; disposed = true; root._simController?.dispose(); } };
}

/**
 * Interactive 3D instrument board used by the first lesson. Three.js is loaded
 * on demand so the rest of AeroPilot remains usable if the CDN is unavailable.
 * A keyboard friendly schematic is provided as a fallback.
 */
export async function initializeCockpitPractice(container, {
  tasks,
  completedTasks = [],
  initialMistakes = 0,
  onProgress = () => {},
  onMistake = () => {},
  onComplete = () => {},
} = {}) {
  if (!container || !tasks?.length) return null;
  const completed = new Set(completedTasks);
  let currentTask = tasks.find((task) => !completed.has(task.id)) || tasks[tasks.length - 1];
  let mistakes = initialMistakes;
  let disposed = false;
  let renderer;
  let resizeObserver;
  let cleanupScene = () => {};

  const frame = document.createElement('div');
  frame.className = 'cockpit-practice-frame';
  const stage = document.createElement('div');
  stage.className = 'cockpit-practice-canvas';
  const instructions = document.createElement('div');
  instructions.className = 'cockpit-practice-instructions';
  frame.append(stage, instructions);
  container.replaceChildren(frame);

  const updateInstructions = (message = '') => {
    const nextTask = tasks.find((task) => !completed.has(task.id));
    if (!nextTask) {
      instructions.innerHTML = `<b class="cockpit-success">Панель изучена ✓</b><span>Все приборы найдены. Практика завершена.</span>`;
      onComplete({ completedTasks: [...completed], mistakes });
      cleanupScene();
      return;
    }
    currentTask = nextTask;
    const count = completed.size;
    instructions.innerHTML = `<b>${escapeText(currentTask.prompt)}</b><span>Найдено: ${count} из ${tasks.length}</span>${message ? `<small>${escapeText(message)}</small>` : '<small>Выбери прибор на схеме.</small>'}`;
  };
  const markInstrument = (id, setHighlight = () => {}) => {
    if (disposed || !currentTask) return;
    if (id === currentTask.id) {
      completed.add(id);
      setHighlight(true);
      onProgress({ completedTasks: [...completed], mistakes });
      updateInstructions('Правильно. Продолжай поиск следующего прибора.');
    } else {
      mistakes += 1;
      onMistake({ mistakes, expected: currentTask.id, selected: id });
      updateInstructions('Это другой прибор. Прочитай подписи и попробуй ещё раз.');
    }
  };

  try {
    const THREE = await import('three');
    if (disposed) return null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10243a');
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 50);
    camera.position.set(0, 0, 11.5);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    stage.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#d8efff', '#27364a', 2.1));
    const keyLight = new THREE.DirectionalLight('#d7f2ff', 2.2);
    keyLight.position.set(-3, 4, 7);
    scene.add(keyLight);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(8.7, 4.8, 0.45), new THREE.MeshStandardMaterial({ color: '#33465b', metalness: 0.45, roughness: 0.5 }));
    panel.position.z = -0.35;
    scene.add(panel);
    const instruments = [];
    const instrumentLabels = [
      { id: 'airspeed', short: 'ASI', label: 'AIRSPEED', value: '105' },
      { id: 'attitude', short: 'AI', label: 'ATTITUDE', value: 'HORIZON' },
      { id: 'altimeter', short: 'ALT', label: 'ALTIMETER', value: '2500' },
      { id: 'heading', short: 'HDG', label: 'HEADING', value: '270°' },
      { id: 'vertical-speed', short: 'VSI', label: 'VERT SPEED', value: '+0' },
      { id: 'tachometer', short: 'RPM', label: 'TACHOMETER', value: '2200' },
    ];
    const positions = [[-2.65, 1.05], [0, 1.05], [2.65, 1.05], [-2.65, -1.25], [0, -1.25], [2.65, -1.25]];
    const highlightMaterials = new Map();
    instrumentLabels.forEach((instrument, index) => {
      const [x, y] = positions[index];
      const faceMaterial = new THREE.MeshStandardMaterial({ map: makeInstrumentTexture(THREE, instrument), color: '#ffffff', roughness: 0.8, metalness: 0.05 });
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.16, 48), new THREE.MeshStandardMaterial({ color: '#131e2c', metalness: 0.7, roughness: 0.35 }));
      face.rotation.x = Math.PI / 2;
      face.position.set(x, y, 0.08);
      scene.add(face);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.66, 48), faceMaterial);
      dial.position.set(x, y, 0.18);
      dial.userData.instrumentId = instrument.id;
      scene.add(dial);
      instruments.push(dial);
      const ringMaterial = new THREE.MeshStandardMaterial({ color: completed.has(instrument.id) ? '#60d7a1' : '#7790a9', metalness: 0.72, roughness: 0.35 });
      highlightMaterials.set(instrument.id, ringMaterial);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.045, 8, 48), ringMaterial);
      ring.position.set(x, y, 0.2);
      scene.add(ring);
      const screwGeometry = new THREE.SphereGeometry(0.055, 10, 10);
      for (const dx of [-0.68, 0.68]) for (const dy of [-0.68, 0.68]) {
        const screw = new THREE.Mesh(screwGeometry, new THREE.MeshStandardMaterial({ color: '#9db3c8', metalness: 0.85, roughness: 0.25 }));
        screw.position.set(x + dx, y + dy, 0.23);
        scene.add(screw);
      }
    });
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const resize = () => {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    const onPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(instruments, false)[0];
      if (!hit) { updateInstructions('Нажми на один из приборов.'); return; }
      const id = hit.object.userData.instrumentId;
      markInstrument(id, (correct) => { if (correct) highlightMaterials.get(id).color.set('#60d7a1'); });
    };
    renderer.domElement.addEventListener('pointerdown', onPointer);
    let animationId;
    const render = () => { if (disposed) return; renderer.render(scene, camera); animationId = requestAnimationFrame(render); };
    render();
    updateInstructions();

    const fallbackDispose = () => {
      cancelAnimationFrame(animationId);
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointer);
      renderer.dispose();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose?.();
      });
    };
    cleanupScene = () => { if (!disposed) { disposed = true; fallbackDispose(); } };
    return { ready: true, dispose() { cleanupScene(); } };
  } catch {
    if (disposed) return null;
    renderFallback(stage, completed, markInstrument);
    updateInstructions('Резервная интерактивная схема: нажимай кнопки приборов.');
    return { ready: false, dispose() { disposed = true; container.replaceChildren(); } };
  }
}

function renderFallback(stage, completed, markInstrument) {
  const fallback = document.createElement('div');
  fallback.className = 'cockpit-fallback-board';
  const labels = [
    { id: 'airspeed', label: 'Указатель воздушной скорости', short: 'ASI' },
    { id: 'attitude', label: 'Авиагоризонт', short: 'AI' },
    { id: 'altimeter', label: 'Высотомер', short: 'ALT' },
    { id: 'heading', label: 'Указатель курса', short: 'HDG' },
    { id: 'vertical-speed', label: 'Вертикальная скорость', short: 'VSI' },
    { id: 'tachometer', label: 'Тахометр', short: 'RPM' },
  ];
  fallback.innerHTML = labels.map((item) => `<button class="fallback-instrument ${completed.has(item.id) ? 'found' : ''}" data-instrument-id="${item.id}" ${completed.has(item.id) ? 'disabled' : ''}><span>${item.short}</span><small>${item.label}</small></button>`).join('');
  fallback.addEventListener('click', (event) => {
    const button = event.target.closest('[data-instrument-id]');
    if (!button || button.disabled) return;
    markInstrument(button.dataset.instrumentId, (correct) => { if (correct) button.classList.add('found'); });
    if (completed.has(button.dataset.instrumentId)) button.disabled = true;
  });
  stage.replaceChildren(fallback);
}

function makeInstrumentTexture(THREE, instrument) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#eaf1f7'; context.beginPath(); context.arc(256, 256, 250, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#50677d'; context.lineWidth = 9;
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    context.beginPath(); context.moveTo(256 + Math.sin(angle) * 183, 256 - Math.cos(angle) * 183); context.lineTo(256 + Math.sin(angle) * 210, 256 - Math.cos(angle) * 210); context.stroke();
  }
  context.fillStyle = '#20364a'; context.textAlign = 'center'; context.font = '700 62px Arial'; context.fillText(instrument.short, 256, 286);
  context.font = '600 27px Arial'; context.fillStyle = '#577188'; context.fillText(instrument.label, 256, 350);
  context.font = '500 24px Arial'; context.fillStyle = '#1788b1'; context.fillText(instrument.value, 256, 398);
  return new THREE.CanvasTexture(canvas);
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
