import type { Application, Container, Text } from "pixi.js";

import type { MapLayers } from "../mapScene";

export interface MapCameraRuntimeState {
  mapZoom: number;
}

export interface MapCameraConfig {
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
  maxTextResolution: number;
  renderResolution: number;
}

export interface MapCameraElements {
  stageEl: HTMLDivElement;
  zoomOutBtn: HTMLButtonElement;
  zoomInBtn: HTMLButtonElement;
  zoomResetBtn: HTMLButtonElement;
  zoomValueEl: HTMLSpanElement;
}

export interface MapCameraController {
  getMapZoom: () => number;
  updateMapZoomUi: () => void;
  mapTextResolution: () => number;
  refreshMapTextQuality: () => void;
  applyMapZoom: (
    nextZoom: number,
    anchorClient?: { x: number; y: number } | null,
  ) => void;
  resetMapView: () => void;
  canvasClientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
}

export function createMapCameraController(
  app: Application,
  mapLayers: MapLayers,
  runtime: MapCameraRuntimeState,
  elements: MapCameraElements,
  config: MapCameraConfig,
): MapCameraController {
  function clampMapZoom(value: number): number {
    return Math.min(config.maxZoom, Math.max(config.minZoom, value));
  }

  function mapTextResolution(): number {
    return Math.min(
      config.maxTextResolution,
      Math.max(config.renderResolution, config.renderResolution * runtime.mapZoom),
    );
  }

  function updateMapZoomUi(): void {
    const zoomPercent = Math.round(runtime.mapZoom * 100);
    elements.zoomValueEl.textContent = `${zoomPercent}%`;
    elements.zoomOutBtn.disabled = runtime.mapZoom <= config.minZoom + 0.001;
    elements.zoomInBtn.disabled = runtime.mapZoom >= config.maxZoom - 0.001;
    elements.zoomResetBtn.disabled = Math.abs(runtime.mapZoom - config.defaultZoom) < 0.001;
  }

  function refreshMapTextQuality(): void {
    const targetResolution = mapTextResolution();
    for (const layer of [mapLayers.planetLayer, mapLayers.fleetLayer, mapLayers.uiLayer]) {
      for (const child of layer.children) {
        if (!(child instanceof Text)) {
          continue;
        }

        if (Math.abs(child.resolution - targetResolution) > 0.01) {
          child.resolution = targetResolution;
        }
        child.roundPixels = true;
      }
    }
  }

  function applyMapZoom(
    nextZoom: number,
    anchorClient: { x: number; y: number } | null = null,
  ): void {
    const clampedZoom = clampMapZoom(nextZoom);
    if (Math.abs(clampedZoom - runtime.mapZoom) < 0.0001) {
      updateMapZoomUi();
      return;
    }

    const previousZoom = runtime.mapZoom;
    if (anchorClient) {
      const rect = (app.view as HTMLCanvasElement).getBoundingClientRect();
      const localX = anchorClient.x - rect.left;
      const localY = anchorClient.y - rect.top;
      const worldX = (localX - app.stage.x) / previousZoom;
      const worldY = (localY - app.stage.y) / previousZoom;

      runtime.mapZoom = clampedZoom;
      app.stage.scale.set(clampedZoom);
      app.stage.position.set(
        localX - worldX * clampedZoom,
        localY - worldY * clampedZoom,
      );
      refreshMapTextQuality();
      updateMapZoomUi();
      return;
    }

    runtime.mapZoom = clampedZoom;
    app.stage.scale.set(clampedZoom);
    refreshMapTextQuality();
    updateMapZoomUi();
  }

  function resetMapView(): void {
    app.stage.position.set(0, 0);
    applyMapZoom(config.defaultZoom);
  }

  function canvasClientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = (app.view as HTMLCanvasElement).getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return {
      x: (localX - app.stage.x) / runtime.mapZoom,
      y: (localY - app.stage.y) / runtime.mapZoom,
    };
  }

  return {
    getMapZoom: () => runtime.mapZoom,
    updateMapZoomUi,
    mapTextResolution,
    refreshMapTextQuality,
    applyMapZoom,
    resetMapView,
    canvasClientToWorld,
  };
}

export interface PanGestureState {
  active: boolean;
  pointerId: number | null;
  startClientX: number;
  startClientY: number;
  startStageX: number;
  startStageY: number;
  moved: boolean;
}

export function createPanGestureState(): PanGestureState {
  return {
    active: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startStageX: 0,
    startStageY: 0,
    moved: false,
  };
}

export function startPan(
  state: PanGestureState,
  appStage: Container,
  stageEl: HTMLDivElement,
  canvas: HTMLCanvasElement,
  event: PointerEvent,
): void {
  state.active = true;
  state.pointerId = event.pointerId;
  state.startClientX = event.clientX;
  state.startClientY = event.clientY;
  state.startStageX = appStage.x;
  state.startStageY = appStage.y;
  state.moved = false;
  canvas.setPointerCapture(event.pointerId);
  stageEl.classList.add("is-panning");
}

export function updatePan(
  state: PanGestureState,
  appStage: Container,
  thresholdPx: number,
  event: PointerEvent,
): { handled: boolean; moved: boolean } {
  if (!state.active || state.pointerId !== event.pointerId) {
    return { handled: false, moved: false };
  }

  const deltaX = event.clientX - state.startClientX;
  const deltaY = event.clientY - state.startClientY;
  if (!state.moved && Math.hypot(deltaX, deltaY) >= thresholdPx) {
    state.moved = true;
  }

  if (state.moved) {
    appStage.position.set(
      state.startStageX + deltaX,
      state.startStageY + deltaY,
    );
  }

  return { handled: true, moved: state.moved };
}

export function finishPan(
  state: PanGestureState,
  stageEl: HTMLDivElement,
  canvas: HTMLCanvasElement,
  event: PointerEvent,
): { handled: boolean; wasMoved: boolean } {
  if (!state.active || state.pointerId !== event.pointerId) {
    return { handled: false, wasMoved: false };
  }

  const wasMoved = state.moved;
  state.active = false;
  state.pointerId = null;
  state.moved = false;
  stageEl.classList.remove("is-panning");

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  return { handled: true, wasMoved };
}
