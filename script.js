const canvas = document.getElementById("simulation");
const ctx = canvas.getContext("2d");
const speedInput = document.getElementById("speed");
const speedValue = document.getElementById("speed-value");
const observerSpeedOfSoundInput = document.getElementById("observer-speed-of-sound");
const observerSpeedLine = document.getElementById("observer-speed-line");
const sourceSpeedLine = document.getElementById("source-speed-line");
const relativeSpeedLine = document.getElementById("relative-speed-line");
const distanceChangeLine = document.getElementById("distance-change-line");
const shiftedFrequencyLine = document.getElementById("shifted-frequency-line");
const graphPanel = document.getElementById("graph-panel");
const graphAxisSelect = document.getElementById("graph-axis");
const resetGraphButton = document.getElementById("reset-graph");
const minimizeGraphButton = document.getElementById("minimize-graph");
const graphCanvas = document.getElementById("graph-canvas");
const graphCtx = graphCanvas.getContext("2d");
const squareSpeedInput = document.getElementById("square-speed");
const squareDirectionInput = document.getElementById("square-direction");
const squareFrequencyInput = document.getElementById("square-frequency");
const spawnSquareButton = document.getElementById("spawn-square");
const deleteSourceButton = document.getElementById("delete-source");
const hideSoundWavesInput = document.getElementById("hide-sound-waves");

let audioContext = null;
let squareOscillator = null;
let squareGainNode = null;
const speedOfSound = 3430;
const unitsPerMeter = 10;
const maxVisibleWaveRadius = speedOfSound * 0.45;
const waveExpansionSpeed = speedOfSound;
const maxWaveEmissionRate = 18;
const visualWaveFrequencyDivisor = 48;
const waveFadeStartRatio = 0.35;
const graphSampleInterval = 1 / 30;
const graphSelectionHitRadius = 10;
const graphPadding = {
  top: 22,
  right: 18,
  bottom: 44,
  left: 56
};

const state = {
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  keys: new Set(),
  speed: observerSpeedOfSoundInput.checked
    ? speedOfSound
    : Number(speedInput.value) * unitsPerMeter,
  gridSize: 50,
  playerRadius: 18,
  square: null,
  hideSoundWaves: hideSoundWavesInput.checked,
  waves: [],
  waveSpawnProgress: 0,
  elapsedTime: 0,
  graphPoints: [],
  graphStartTime: null,
  graphNextPointId: 1,
  hoveredGraphPointId: null,
  selectedGraphPointIds: new Set(),
  graphFullscreen: false,
  graphKeys: new Set(),
  graphCamera: {
    centerX: 0,
    centerY: 500,
    scaleX: 1,
    scaleY: 1
  },
  graphDrag: {
    active: false,
    pointerId: null,
    didMove: false,
    suppressClick: false,
    lastX: 0,
    lastY: 0
  },
  continuousGraphCapture: false,
  graphCaptureProgress: 0
};

function renderSpeed() {
  speedValue.textContent = `${formatMetersPerSecond(state.speed)} m/s`;
}

function applyObserverSpeedSetting() {
  speedInput.disabled = observerSpeedOfSoundInput.checked;
  state.speed = observerSpeedOfSoundInput.checked
    ? speedOfSound
    : Number(speedInput.value) * unitsPerMeter;
  renderSpeed();
  updateVelocity();
  renderTelemetry();
}

function toMeters(valueInUnits) {
  return valueInUnits / unitsPerMeter;
}

function formatMeters(valueInUnits) {
  return toMeters(valueInUnits).toFixed(2);
}

function formatMetersPerSecond(valueInUnitsPerSecond) {
  return toMeters(valueInUnitsPerSecond).toFixed(2);
}

function getGraphXAxisLabel() {
  switch (graphAxisSelect.value) {
    case "time":
      return "Time (s)";
    case "distance-change-speed":
      return "Distance Change Speed (m/s)";
    case "relative-speed":
      return "Relative Speed (m/s)";
    case "distance":
      return "Distance (m)";
    default:
      return "Time (s)";
  }
}

function getCurrentGraphXValue() {
  switch (graphAxisSelect.value) {
    case "time":
      return state.graphStartTime === null
        ? 0
        : state.elapsedTime - state.graphStartTime;
    case "distance-change-speed":
      return toMeters(getDistanceChangeSpeed());
    case "relative-speed":
      return toMeters(getRelativeSpeed());
    case "distance":
      return toMeters(getDistanceBetweenObserverAndSource());
    default:
      return state.elapsedTime;
  }
}

function formatGraphXAxisValue(value) {
  switch (graphAxisSelect.value) {
    case "time":
      return `${value.toFixed(2)} s`;
    case "distance-change-speed":
    case "relative-speed":
      return `${value.toFixed(2)} m/s`;
    case "distance":
      return `${value.toFixed(2)} m`;
    default:
      return value.toFixed(2);
  }
}

function getGraphXAxisTitle() {
  switch (graphAxisSelect.value) {
    case "time":
      return "Time";
    case "distance-change-speed":
      return "Distance Change Speed";
    case "relative-speed":
      return "Relative Speed";
    case "distance":
      return "Distance";
    default:
      return "Time";
  }
}

function clearGraphSelection() {
  state.selectedGraphPointIds.clear();
}

function setHoveredGraphPoint(pointId) {
  state.hoveredGraphPointId = pointId;

  if (state.graphFullscreen && pointId !== null) {
    graphPanel.classList.add("is-hovering-point");
  } else {
    graphPanel.classList.remove("is-hovering-point");
  }
}

function resetGraph() {
  state.graphPoints = [];
  state.graphCaptureProgress = 0;
  state.graphStartTime = null;
  setHoveredGraphPoint(null);
  clearGraphSelection();

  if (state.graphFullscreen) {
    initializeGraphCamera();
    drawGraph();
  }
}

function addGraphPoint() {
  if (graphAxisSelect.value === "time" && state.graphStartTime === null) {
    state.graphStartTime = state.elapsedTime;
  }

  state.graphPoints.push({
    id: state.graphNextPointId++,
    x: getCurrentGraphXValue(),
    y: state.square ? getShiftedFrequency() : 0
  });

  if (state.graphPoints.length > 2500) {
    const removedPoint = state.graphPoints.shift();

    if (removedPoint) {
      state.selectedGraphPointIds.delete(removedPoint.id);
    }
  }
}

function getSourceVelocity() {
  return state.square
    ? state.square.velocity
    : { x: 0, y: 0 };
}

function getObserverSpeed() {
  return Math.hypot(state.velocity.x, state.velocity.y);
}

function getSourceSpeed() {
  const sourceVelocity = getSourceVelocity();
  return Math.hypot(sourceVelocity.x, sourceVelocity.y);
}

function getRelativeSpeed() {
  const sourceVelocity = getSourceVelocity();
  return Math.hypot(
    state.velocity.x - sourceVelocity.x,
    state.velocity.y - sourceVelocity.y
  );
}

function getDistanceChangeSpeed() {
  if (!state.square) {
    return 0;
  }

  const offsetX = state.position.x - state.square.position.x;
  const offsetY = state.position.y - state.square.position.y;
  const distance = Math.hypot(offsetX, offsetY);

  if (distance < 0.0001) {
    return 0;
  }

  const sourceVelocity = getSourceVelocity();
  const unitX = offsetX / distance;
  const unitY = offsetY / distance;

  return (
    (state.velocity.x - sourceVelocity.x) * unitX +
    (state.velocity.y - sourceVelocity.y) * unitY
  );
}

function getDistanceBetweenObserverAndSource() {
  if (!state.square) {
    return 0;
  }

  return Math.hypot(
    state.position.x - state.square.position.x,
    state.position.y - state.square.position.y
  );
}

function renderTelemetry() {
  const shiftedFrequency = state.square ? getShiftedFrequency() : 0;
  observerSpeedLine.textContent = `${formatMetersPerSecond(getObserverSpeed())} m/s - Observer Speed;`;
  sourceSpeedLine.textContent = `${formatMetersPerSecond(getSourceSpeed())} m/s - Source Speed;`;
  relativeSpeedLine.textContent = `${formatMetersPerSecond(getRelativeSpeed())} m/s - Relative Speed;`;
  distanceChangeLine.textContent = `${formatMetersPerSecond(getDistanceChangeSpeed())} m/s - Distance Change Speed;`;
  shiftedFrequencyLine.textContent = `${shiftedFrequency.toFixed(2)} Hz - Shifted Frequency.`;
}

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

async function pauseSourceSound() {
  if (audioContext && audioContext.state === "running") {
    await audioContext.suspend();
  }
}

async function resumeSourceSound() {
  if (!state.square || !audioContext) {
    return;
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  updateSquareSound();
}

function stopSquareSound() {
  if (squareOscillator) {
    squareOscillator.stop();
    squareOscillator.disconnect();
    squareOscillator = null;
  }

  if (squareGainNode) {
    squareGainNode.disconnect();
    squareGainNode = null;
  }
}

async function startSquareSound(frequency) {
  await ensureAudioContext();
  stopSquareSound();

  squareOscillator = audioContext.createOscillator();
  squareGainNode = audioContext.createGain();

  squareOscillator.type = "sine";
  squareOscillator.frequency.value = frequency;
  squareGainNode.gain.value = 0.05;

  squareOscillator.connect(squareGainNode);
  squareGainNode.connect(audioContext.destination);
  squareOscillator.start();
}

function getShiftedFrequency() {
  if (!state.square) {
    return 0;
  }

  const offsetX = state.position.x - state.square.position.x;
  const offsetY = state.position.y - state.square.position.y;
  const distance = Math.hypot(offsetX, offsetY);

  if (distance < 0.0001) {
    return state.square.frequency;
  }

  // Project both velocities onto the source-to-observer line for the Doppler formula.
  const unitX = offsetX / distance;
  const unitY = offsetY / distance;
  const observerSpeedTowardSource = -(
    state.velocity.x * unitX +
    state.velocity.y * unitY
  );
  const sourceSpeedTowardObserver =
    state.square.velocity.x * unitX +
    state.square.velocity.y * unitY;
  const numerator = speedOfSound + observerSpeedTowardSource;
  const denominator = speedOfSound - sourceSpeedTowardObserver;

  if (denominator <= 0) {
    return state.square.frequency;
  }

  return state.square.frequency * (numerator / denominator);
}

function updateSquareSound() {
  if (!audioContext || !squareOscillator || !state.square) {
    return;
  }

  const shiftedFrequency = getShiftedFrequency();
  squareOscillator.frequency.cancelScheduledValues(audioContext.currentTime);
  squareOscillator.frequency.setTargetAtTime(
    shiftedFrequency,
    audioContext.currentTime,
    0.02
  );
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  resizeGraphCanvas();
}

function resizeGraphCanvas() {
  const bounds = graphCanvas.getBoundingClientRect();
  const devicePixelRatio = window.devicePixelRatio || 1;

  graphCanvas.width = Math.max(1, Math.floor(bounds.width * devicePixelRatio));
  graphCanvas.height = Math.max(1, Math.floor(bounds.height * devicePixelRatio));
  graphCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function getGraphAutoRanges() {
  const xValues = state.graphPoints.map((point) => point.x);
  const yValues = state.graphPoints.map((point) => point.y);

  return {
    xRange: getGraphRange(
      xValues,
      graphAxisSelect.value === "distance-change-speed" ? -1 : 0,
      graphAxisSelect.value === "distance-change-speed" ? 1 : 10
    ),
    yRange: getGraphRange(yValues, 0, 1000)
  };
}

function initializeGraphCamera() {
  const plotWidth = Math.max(1, graphCanvas.clientWidth - graphPadding.left - graphPadding.right);
  const plotHeight = Math.max(1, graphCanvas.clientHeight - graphPadding.top - graphPadding.bottom);
  const { xRange, yRange } = getGraphAutoRanges();

  state.graphCamera.centerX = (xRange.min + xRange.max) / 2;
  state.graphCamera.centerY = (yRange.min + yRange.max) / 2;
  state.graphCamera.scaleX = plotWidth / Math.max(0.0001, xRange.max - xRange.min);
  state.graphCamera.scaleY = plotHeight / Math.max(0.0001, yRange.max - yRange.min);
}

async function enterGraphFullscreen() {
  if (state.graphFullscreen) {
    return;
  }

  state.graphFullscreen = true;
  state.continuousGraphCapture = false;
  state.graphCaptureProgress = 0;
  state.keys.clear();
  state.graphKeys.clear();
  updateVelocity();
  graphPanel.classList.add("expanded");
  resizeGraphCanvas();
  initializeGraphCamera();
  drawGraph();
  await pauseSourceSound();
}

async function exitGraphFullscreen() {
  if (!state.graphFullscreen) {
    return;
  }

  state.graphFullscreen = false;
  state.graphKeys.clear();
  setHoveredGraphPoint(null);
  clearGraphSelection();
  state.graphDrag.active = false;
  state.graphDrag.pointerId = null;
  state.graphDrag.didMove = false;
  state.graphDrag.suppressClick = false;
  graphPanel.classList.remove("is-dragging");
  graphPanel.classList.remove("expanded");
  resizeGraphCanvas();
  await resumeSourceSound();
  drawGraph();
}

function clampGraphScale(scale) {
  return Math.min(100000, Math.max(0.25, scale));
}

function handleGraphWheel(event) {
  if (!state.graphFullscreen) {
    return;
  }

  event.preventDefault();

  const plotWidth = graphCanvas.clientWidth - graphPadding.left - graphPadding.right;
  const plotHeight = graphCanvas.clientHeight - graphPadding.top - graphPadding.bottom;
  const rect = graphCanvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const plotCenterX = graphPadding.left + plotWidth / 2;
  const plotCenterY = graphPadding.top + plotHeight / 2;
  const worldXBefore =
    state.graphCamera.centerX + (mouseX - plotCenterX) / state.graphCamera.scaleX;
  const worldYBefore =
    state.graphCamera.centerY - (mouseY - plotCenterY) / state.graphCamera.scaleY;
  const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;

  state.graphCamera.scaleX = clampGraphScale(state.graphCamera.scaleX * zoomFactor);
  state.graphCamera.scaleY = clampGraphScale(state.graphCamera.scaleY * zoomFactor);
  state.graphCamera.centerX =
    worldXBefore - (mouseX - plotCenterX) / state.graphCamera.scaleX;
  state.graphCamera.centerY =
    worldYBefore + (mouseY - plotCenterY) / state.graphCamera.scaleY;
}

function getGraphPointAtCanvasPosition(canvasX, canvasY) {
  const viewState = getGraphViewState();
  let closestPoint = null;
  let closestDistanceSquared = graphSelectionHitRadius ** 2;

  for (const point of state.graphPoints) {
    const pointX = viewState.mapX(point.x);
    const pointY = viewState.mapY(point.y);
    const distanceSquared = (pointX - canvasX) ** 2 + (pointY - canvasY) ** 2;

    if (distanceSquared <= closestDistanceSquared) {
      closestPoint = point;
      closestDistanceSquared = distanceSquared;
    }
  }

  return closestPoint;
}

function updateGraphHover(event) {
  if (!state.graphFullscreen || state.graphDrag.active) {
    return;
  }

  const rect = graphCanvas.getBoundingClientRect();
  const hoverX = event.clientX - rect.left;
  const hoverY = event.clientY - rect.top;
  const hoveredPoint = getGraphPointAtCanvasPosition(hoverX, hoverY);
  setHoveredGraphPoint(hoveredPoint ? hoveredPoint.id : null);
}

function startGraphDrag(event) {
  if (!state.graphFullscreen) {
    return;
  }

  event.preventDefault();
  setHoveredGraphPoint(null);
  state.graphDrag.active = true;
  state.graphDrag.pointerId = event.pointerId;
  state.graphDrag.didMove = false;
  state.graphDrag.lastX = event.clientX;
  state.graphDrag.lastY = event.clientY;
  graphPanel.classList.add("is-dragging");
  graphCanvas.setPointerCapture(event.pointerId);
}

function moveGraphDrag(event) {
  if (!state.graphFullscreen) {
    return;
  }

  if (!state.graphDrag.active) {
    updateGraphHover(event);
    return;
  }

  if (event.pointerId !== state.graphDrag.pointerId) {
    return;
  }

  event.preventDefault();

  const deltaX = event.clientX - state.graphDrag.lastX;
  const deltaY = event.clientY - state.graphDrag.lastY;

  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
    state.graphDrag.didMove = true;
  }

  state.graphDrag.lastX = event.clientX;
  state.graphDrag.lastY = event.clientY;
  state.graphCamera.centerX -= deltaX / state.graphCamera.scaleX;
  state.graphCamera.centerY += deltaY / state.graphCamera.scaleY;
  setHoveredGraphPoint(null);
}

function endGraphDrag(event) {
  if (
    !state.graphDrag.active ||
    (event.pointerId !== undefined && event.pointerId !== state.graphDrag.pointerId)
  ) {
    return;
  }

  if (event.pointerId !== undefined && graphCanvas.hasPointerCapture(event.pointerId)) {
    graphCanvas.releasePointerCapture(event.pointerId);
  }

  state.graphDrag.suppressClick = state.graphDrag.didMove;
  state.graphDrag.active = false;
  state.graphDrag.pointerId = null;
  state.graphDrag.didMove = false;
  graphPanel.classList.remove("is-dragging");
}

function clampAxis(value) {
  if (value > 0) {
    return 1;
  }

  if (value < 0) {
    return -1;
  }

  return 0;
}

function updateVelocity() {
  const horizontal = clampAxis(
    (state.keys.has("KeyD") ? 1 : 0) - (state.keys.has("KeyA") ? 1 : 0)
  );
  const vertical = clampAxis(
    (state.keys.has("KeyS") ? 1 : 0) - (state.keys.has("KeyW") ? 1 : 0)
  );

  let x = horizontal;
  let y = vertical;

  if (x !== 0 && y !== 0) {
    const length = Math.hypot(x, y);
    x /= length;
    y /= length;
  }

  state.velocity.x = x * state.speed;
  state.velocity.y = y * state.speed;
}

function getWaveEmissionRate(frequency) {
  return Math.min(maxWaveEmissionRate, Math.max(1, frequency / visualWaveFrequencyDivisor));
}

function spawnWave() {
  if (!state.square) {
    return;
  }

  state.waves.push({
    originX: state.square.position.x,
    originY: state.square.position.y,
    radius: 0
  });
}

function updateWaves(deltaTime) {
  if (state.hideSoundWaves) {
    state.waves = [];
    state.waveSpawnProgress = 0;
    return;
  }

  if (state.square) {
    state.waveSpawnProgress += getWaveEmissionRate(state.square.frequency) * deltaTime;

    while (state.waveSpawnProgress >= 1) {
      spawnWave();
      state.waveSpawnProgress -= 1;
    }
  } else {
    state.waveSpawnProgress = 0;
  }

  state.waves = state.waves
    .map((wave) => ({
      ...wave,
      radius: wave.radius + waveExpansionSpeed * deltaTime
    }))
    .filter((wave) => wave.radius <= maxVisibleWaveRadius);
}

function getGraphRange(values, fallbackMin, fallbackMax) {
  if (values.length === 0) {
    return { min: fallbackMin, max: fallbackMax };
  }

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.1 || 1);
    min -= padding;
    max += padding;
  } else {
    const padding = (max - min) * 0.08;
    min -= padding;
    max += padding;
  }

  return { min, max };
}

function getNiceGraphStep(rawStep) {
  if (rawStep <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function updateGraphCamera(deltaTime) {
  if (!state.graphFullscreen) {
    return;
  }

  const panSpeed = 420;
  const horizontal =
    (state.graphKeys.has("KeyD") ? 1 : 0) - (state.graphKeys.has("KeyA") ? 1 : 0);
  const vertical =
    (state.graphKeys.has("KeyW") ? 1 : 0) - (state.graphKeys.has("KeyS") ? 1 : 0);

  state.graphCamera.centerX += (horizontal * panSpeed * deltaTime) / state.graphCamera.scaleX;
  state.graphCamera.centerY += (vertical * panSpeed * deltaTime) / state.graphCamera.scaleY;
}

function getGraphViewState() {
  const width = graphCanvas.clientWidth;
  const height = graphCanvas.clientHeight;
  const plotWidth = width - graphPadding.left - graphPadding.right;
  const plotHeight = height - graphPadding.top - graphPadding.bottom;
  const { xRange: autoXRange, yRange: autoYRange } = getGraphAutoRanges();
  const xRange = state.graphFullscreen
    ? {
        min: state.graphCamera.centerX - plotWidth / (2 * state.graphCamera.scaleX),
        max: state.graphCamera.centerX + plotWidth / (2 * state.graphCamera.scaleX)
      }
    : autoXRange;
  const yRange = state.graphFullscreen
    ? {
        min: state.graphCamera.centerY - plotHeight / (2 * state.graphCamera.scaleY),
        max: state.graphCamera.centerY + plotHeight / (2 * state.graphCamera.scaleY)
      }
    : autoYRange;

  return {
    width,
    height,
    plotWidth,
    plotHeight,
    xRange,
    yRange,
    mapX: (value) =>
      graphPadding.left + ((value - xRange.min) / (xRange.max - xRange.min)) * plotWidth,
    mapY: (value) =>
      height - graphPadding.bottom - ((value - yRange.min) / (yRange.max - yRange.min)) * plotHeight
  };
}

function drawSelectedPointLabels(viewState) {
  const selectedPoints = state.graphPoints.filter((point) =>
    state.selectedGraphPointIds.has(point.id)
  );

  for (const point of selectedPoints) {
    const pointX = viewState.mapX(point.x);
    const pointY = viewState.mapY(point.y);

    if (
      pointX < graphPadding.left ||
      pointX > viewState.width - graphPadding.right ||
      pointY < graphPadding.top ||
      pointY > viewState.height - graphPadding.bottom
    ) {
      continue;
    }

    const lines = [
      `${getGraphXAxisTitle()}: ${formatGraphXAxisValue(point.x)}`,
      `Shifted Frequency: ${point.y.toFixed(2)} Hz`
    ];
    const boxPaddingX = 10;
    const boxPaddingY = 8;
    const lineHeight = 16;
    const boxWidth =
      Math.max(...lines.map((line) => graphCtx.measureText(line).width)) + boxPaddingX * 2;
    const boxHeight = lines.length * lineHeight + boxPaddingY * 2;
    let boxX = pointX + 14;
    let boxY = pointY - boxHeight - 12;

    if (boxX + boxWidth > viewState.width - 8) {
      boxX = pointX - boxWidth - 14;
    }

    if (boxY < 8) {
      boxY = pointY + 14;
    }

    graphCtx.fillStyle = "rgba(9, 15, 24, 0.92)";
    graphCtx.strokeStyle = "#d946ef";
    graphCtx.lineWidth = 2;
    graphCtx.fillRect(boxX, boxY, boxWidth, boxHeight);
    graphCtx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    graphCtx.fillStyle = "#f5d0fe";

    lines.forEach((line, index) => {
      graphCtx.fillText(
        line,
        boxX + boxPaddingX,
        boxY + boxPaddingY + 12 + index * lineHeight
      );
    });
  }
}

function handleGraphClick(event) {
  if (!state.graphFullscreen) {
    enterGraphFullscreen();
    return;
  }

  if (state.graphDrag.suppressClick) {
    state.graphDrag.suppressClick = false;
    return;
  }

  const rect = graphCanvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  const closestPoint = getGraphPointAtCanvasPosition(clickX, clickY);

  if (!closestPoint) {
    setHoveredGraphPoint(null);
    clearGraphSelection();
    return;
  }

  if (event.shiftKey) {
    if (state.selectedGraphPointIds.has(closestPoint.id)) {
      state.selectedGraphPointIds.delete(closestPoint.id);
    } else {
      state.selectedGraphPointIds.add(closestPoint.id);
    }
  } else {
    clearGraphSelection();
    state.selectedGraphPointIds.add(closestPoint.id);
  }

  setHoveredGraphPoint(closestPoint.id);
}

function drawGraph() {
  const viewState = getGraphViewState();
  const { width, height, plotWidth, plotHeight, xRange, yRange, mapX, mapY } = viewState;

  graphCtx.clearRect(0, 0, width, height);
  graphCtx.fillStyle = "rgba(6, 12, 20, 0.94)";
  graphCtx.fillRect(0, 0, width, height);
  graphCtx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  graphCtx.lineWidth = 1;
  graphCtx.strokeRect(0.5, 0.5, width - 1, height - 1);
  graphCtx.font = '12px "Segoe UI", sans-serif';

  if (state.graphFullscreen) {
    const stepX = getNiceGraphStep((xRange.max - xRange.min) / 10);
    const stepY = getNiceGraphStep((yRange.max - yRange.min) / 10);
    const gridStartX = Math.floor(xRange.min / stepX) * stepX;
    const gridStartY = Math.floor(yRange.min / stepY) * stepY;

    graphCtx.strokeStyle = "rgba(143, 211, 255, 0.18)";
    graphCtx.lineWidth = 1;

    for (let x = gridStartX; x <= xRange.max; x += stepX) {
      const screenX = mapX(x);

      graphCtx.beginPath();
      graphCtx.moveTo(screenX, graphPadding.top);
      graphCtx.lineTo(screenX, height - graphPadding.bottom);
      graphCtx.stroke();

      graphCtx.fillStyle = "#9bc0e4";
      const label = formatGraphXAxisValue(x);
      graphCtx.fillText(
        label,
        Math.min(
          Math.max(screenX - graphCtx.measureText(label).width / 2, graphPadding.left),
          width - graphPadding.right - graphCtx.measureText(label).width
        ),
        height - 18
      );
    }

    for (let y = gridStartY; y <= yRange.max; y += stepY) {
      const screenY = mapY(y);

      graphCtx.beginPath();
      graphCtx.moveTo(graphPadding.left, screenY);
      graphCtx.lineTo(width - graphPadding.right, screenY);
      graphCtx.stroke();

      graphCtx.fillStyle = "#9bc0e4";
      graphCtx.fillText(`${y.toFixed(2)} Hz`, 10, screenY + 4);
    }

    graphCtx.strokeStyle = "rgba(255, 107, 107, 0.9)";
    graphCtx.lineWidth = 2;

    if (yRange.min <= 0 && yRange.max >= 0) {
      const axisY = mapY(0);
      graphCtx.beginPath();
      graphCtx.moveTo(graphPadding.left, axisY);
      graphCtx.lineTo(width - graphPadding.right, axisY);
      graphCtx.stroke();
    }

    graphCtx.strokeStyle = "rgba(77, 171, 247, 0.95)";

    if (xRange.min <= 0 && xRange.max >= 0) {
      const axisX = mapX(0);
      graphCtx.beginPath();
      graphCtx.moveTo(axisX, graphPadding.top);
      graphCtx.lineTo(axisX, height - graphPadding.bottom);
      graphCtx.stroke();
    }
  }

  graphCtx.strokeStyle = "rgba(155, 180, 210, 0.32)";
  graphCtx.beginPath();
  graphCtx.moveTo(graphPadding.left, graphPadding.top);
  graphCtx.lineTo(graphPadding.left, height - graphPadding.bottom);
  graphCtx.lineTo(width - graphPadding.right, height - graphPadding.bottom);
  graphCtx.stroke();

  graphCtx.fillStyle = "#dce7f5";
  graphCtx.font = 'bold 12px "Segoe UI", sans-serif';
  graphCtx.fillText("Shifted Frequency (Hz)", graphPadding.left, 14);
  const xAxisTitle = getGraphXAxisLabel();
  graphCtx.fillText(
    xAxisTitle,
    width - graphPadding.right - graphCtx.measureText(xAxisTitle).width,
    height - graphPadding.bottom - 10
  );

  graphCtx.fillStyle = "#9bc0e4";
  graphCtx.font = '12px "Segoe UI", sans-serif';
  graphCtx.fillText(`${yRange.max.toFixed(2)} Hz`, 10, graphPadding.top + 4);
  graphCtx.fillText(`${yRange.min.toFixed(2)} Hz`, 10, height - graphPadding.bottom + 4);
  graphCtx.fillText(formatGraphXAxisValue(xRange.min), graphPadding.left, height - 18);
  const xMaxLabel = formatGraphXAxisValue(xRange.max);
  graphCtx.fillText(
    xMaxLabel,
    width - graphPadding.right - graphCtx.measureText(xMaxLabel).width,
    height - 18
  );

  if (state.graphFullscreen) {
    const helpText = "W/A/S/D pan | Mouse wheel zoom";
    graphCtx.fillStyle = "rgba(220, 231, 245, 0.75)";
    graphCtx.fillText(
      helpText,
      width - graphPadding.right - graphCtx.measureText(helpText).width,
      14
    );

    if (state.hoveredGraphPointId !== null) {
      const selectionHint = "Click or Shift-click to select points";
      graphCtx.fillStyle = "rgba(245, 208, 254, 0.92)";
      graphCtx.font = 'bold 12px "Segoe UI", sans-serif';
      graphCtx.fillText(
        selectionHint,
        Math.max(
          graphPadding.left,
          (width - graphCtx.measureText(selectionHint).width) / 2
        ),
        14
      );
      graphCtx.font = '12px "Segoe UI", sans-serif';
    }
  }

  if (state.graphPoints.length === 0) {
    graphCtx.fillStyle = "rgba(220, 231, 245, 0.6)";
    graphCtx.fillText("Press P or hold O to record points", graphPadding.left, graphPadding.top + 22);
    return;
  }

  graphCtx.strokeStyle = "#8fd3ff";
  graphCtx.lineWidth = 2;
  graphCtx.beginPath();

  state.graphPoints.forEach((point, index) => {
    const x = mapX(point.x);
    const y = mapY(point.y);

    if (index === 0) {
      graphCtx.moveTo(x, y);
    } else {
      graphCtx.lineTo(x, y);
    }
  });

  graphCtx.stroke();

  for (const point of state.graphPoints) {
    const x = mapX(point.x);
    const y = mapY(point.y);

    graphCtx.beginPath();
    graphCtx.arc(x, y, state.selectedGraphPointIds.has(point.id) ? 5 : 2.5, 0, Math.PI * 2);
    graphCtx.fillStyle = state.selectedGraphPointIds.has(point.id) ? "#d946ef" : "#ffd84d";
    graphCtx.fill();

    if (state.selectedGraphPointIds.has(point.id)) {
      graphCtx.strokeStyle = "#f5d0fe";
      graphCtx.lineWidth = 1.5;
      graphCtx.stroke();
    }
  }

  if (state.graphFullscreen && state.selectedGraphPointIds.size > 0) {
    drawSelectedPointLabels(viewState);
  }
}

function drawGrid(viewWidth, viewHeight) {
  const spacing = state.gridSize;
  const cameraOffsetX = viewWidth / 2 - state.position.x;
  const cameraOffsetY = viewHeight / 2 - state.position.y;

  ctx.save();
  ctx.translate(cameraOffsetX, cameraOffsetY);

  const startX = Math.floor((state.position.x - viewWidth / 2) / spacing) * spacing - spacing;
  const endX = Math.ceil((state.position.x + viewWidth / 2) / spacing) * spacing + spacing;
  const startY = Math.floor((state.position.y - viewHeight / 2) / spacing) * spacing - spacing;
  const endY = Math.ceil((state.position.y + viewHeight / 2) / spacing) * spacing + spacing;

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(155, 180, 210, 0.22)";
  ctx.beginPath();

  for (let x = startX; x <= endX; x += spacing) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }

  for (let y = startY; y <= endY; y += spacing) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }

  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.moveTo(startX, 0);
  ctx.lineTo(endX, 0);
  ctx.stroke();

  ctx.strokeStyle = "#4dabf7";
  ctx.beginPath();
  ctx.moveTo(0, startY);
  ctx.lineTo(0, endY);
  ctx.stroke();

  ctx.restore();
}

function drawPlayer(viewWidth, viewHeight) {
  const centerX = viewWidth / 2;
  const centerY = viewHeight / 2;

  ctx.beginPath();
  ctx.arc(centerX, centerY, state.playerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd166";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#f08c00";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, state.playerRadius + 8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 209, 102, 0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSquare(viewWidth, viewHeight) {
  if (!state.square) {
    return;
  }

  const screenX = viewWidth / 2 + (state.square.position.x - state.position.x);
  const screenY = viewHeight / 2 + (state.square.position.y - state.position.y);
  const size = state.square.size;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.fillStyle = "#7bd389";
  ctx.strokeStyle = "#2f9e44";
  ctx.lineWidth = 3;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawWaves(viewWidth, viewHeight) {
  for (const wave of state.waves) {
    const fadeStartRadius = maxVisibleWaveRadius * waveFadeStartRatio;
    const fadeProgress = Math.max(
      0,
      (wave.radius - fadeStartRadius) / (maxVisibleWaveRadius - fadeStartRadius)
    );
    const screenX = viewWidth / 2 + (wave.originX - state.position.x);
    const screenY = viewHeight / 2 + (wave.originY - state.position.y);

    ctx.beginPath();
    ctx.arc(screenX, screenY, wave.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - fadeProgress) * 0.85})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawCoordinates() {
  ctx.fillStyle = "#dce7f5";
  ctx.font = '14px "Segoe UI", sans-serif';
  ctx.fillText(`World X: ${formatMeters(state.position.x)} m`, 20, canvas.height - 44);
  ctx.fillText(`World Y: ${formatMeters(state.position.y)} m`, 20, canvas.height - 22);

  if (state.square) {
    ctx.fillStyle = "#8fd3ff";
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.fillText(`Distance: ${formatMeters(getDistanceBetweenObserverAndSource())} m`, 20, canvas.height - 88);
    ctx.fillStyle = "#dce7f5";
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText(
      `Source: (${formatMeters(state.square.position.x)} m, ${formatMeters(state.square.position.y)} m)`,
      20,
      canvas.height - 66
    );
  }
}

async function spawnSquare() {
  const speed = Math.max(0, Number(squareSpeedInput.value) || 0) * unitsPerMeter;
  const directionDegrees = Number(squareDirectionInput.value) || 0;
  const frequency = Math.min(20000, Math.max(20, Number(squareFrequencyInput.value) || 440));
  const directionRadians = directionDegrees * (Math.PI / 180);

  state.square = {
    position: { x: 0, y: 0 },
    velocity: {
      x: Math.cos(directionRadians) * speed,
      y: Math.sin(directionRadians) * speed
    },
    directionDegrees,
    speed,
    frequency,
    size: 34
  };

  state.waves = [];
  state.waveSpawnProgress = 0;
  squareFrequencyInput.value = String(frequency);
  await startSquareSound(frequency);
  updateSquareSound();
  renderTelemetry();
}

function deleteSource() {
  state.square = null;
  state.waves = [];
  state.waveSpawnProgress = 0;
  stopSquareSound();
  renderTelemetry();
}

let previousTime = performance.now();

function frame(currentTime) {
  const deltaTime = (currentTime - previousTime) / 1000;
  previousTime = currentTime;
  updateGraphCamera(deltaTime);

  if (!state.graphFullscreen) {
    state.elapsedTime += deltaTime;

    state.position.x += state.velocity.x * deltaTime;
    state.position.y += state.velocity.y * deltaTime;

    if (state.square) {
      state.square.position.x += state.square.velocity.x * deltaTime;
      state.square.position.y += state.square.velocity.y * deltaTime;
    }

    updateWaves(deltaTime);
    updateSquareSound();
    renderTelemetry();

    if (state.continuousGraphCapture) {
      state.graphCaptureProgress += deltaTime;

      while (state.graphCaptureProgress >= graphSampleInterval) {
        addGraphPoint();
        state.graphCaptureProgress -= graphSampleInterval;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGrid(canvas.width, canvas.height);
    drawWaves(canvas.width, canvas.height);
    drawSquare(canvas.width, canvas.height);
    drawPlayer(canvas.width, canvas.height);
    drawCoordinates();
  }

  drawGraph();

  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (state.graphFullscreen) {
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      event.preventDefault();
      state.graphKeys.add(event.code);
    }

    return;
  }

  if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
    event.preventDefault();
    state.keys.add(event.code);
    updateVelocity();
  }

  if (event.code === "KeyP" && !event.repeat) {
    event.preventDefault();
    addGraphPoint();
  }

  if (event.code === "KeyO") {
    event.preventDefault();

    if (!event.repeat) {
      state.continuousGraphCapture = true;
      state.graphCaptureProgress = 0;
      addGraphPoint();
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (state.graphFullscreen) {
    if (state.graphKeys.delete(event.code)) {
      event.preventDefault();
    }

    return;
  }

  if (state.keys.delete(event.code)) {
    updateVelocity();
  }

  if (event.code === "KeyO") {
    state.continuousGraphCapture = false;
    state.graphCaptureProgress = 0;
  }
});

speedInput.addEventListener("input", () => {
  if (!observerSpeedOfSoundInput.checked) {
    applyObserverSpeedSetting();
  }
});
observerSpeedOfSoundInput.addEventListener("change", applyObserverSpeedSetting);

spawnSquareButton.addEventListener("click", spawnSquare);
deleteSourceButton.addEventListener("click", deleteSource);
hideSoundWavesInput.addEventListener("change", () => {
  state.hideSoundWaves = hideSoundWavesInput.checked;

  if (state.hideSoundWaves) {
    state.waves = [];
    state.waveSpawnProgress = 0;
  }
});
graphAxisSelect.addEventListener("change", resetGraph);
resetGraphButton.addEventListener("click", resetGraph);
minimizeGraphButton.addEventListener("click", () => {
  exitGraphFullscreen();
});
graphCanvas.addEventListener("click", handleGraphClick);
graphCanvas.addEventListener("pointerdown", startGraphDrag);
graphCanvas.addEventListener("pointermove", moveGraphDrag);
graphCanvas.addEventListener("pointerup", endGraphDrag);
graphCanvas.addEventListener("pointercancel", endGraphDrag);
graphCanvas.addEventListener("pointerleave", () => {
  if (!state.graphDrag.active) {
    setHoveredGraphPoint(null);
  }
});
graphCanvas.addEventListener("wheel", handleGraphWheel, { passive: false });

window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", stopSquareSound);

resizeCanvas();
applyObserverSpeedSetting();
drawGraph();
requestAnimationFrame(frame);
