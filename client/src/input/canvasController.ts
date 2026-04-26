import type { HexCoord } from "../../../src/types";
import type {
  MapCameraController,
  PanGestureState,
} from "../map/camera";
import { finishPan, startPan, updatePan } from "../map/camera";

export interface CanvasControllerDeps {
  appStage: {
    x: number;
    y: number;
    position: { set: (x: number, y: number) => void };
  };
  stageEl: HTMLDivElement;
  canvas: HTMLCanvasElement;
  panGesture: PanGestureState;
  panDragThresholdPx: number;
  mapCamera: MapCameraController;
  toHex: (x: number, y: number) => HexCoord;
  isHoverHexValid: (coord: HexCoord) => boolean;
  onHoverHex: (coord: HexCoord | null) => void;
  onPrimaryClick: (clientX: number, clientY: number) => void;
  onPanMove: () => void;
  onPanStateChange: (active: boolean) => void;
  wheelZoomSensitivity: number;
}

export interface CanvasController {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onPointerLeave: () => void;
  onWheel: (event: WheelEvent) => void;
}

export function createCanvasController(
  deps: CanvasControllerDeps,
): CanvasController {
  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    startPan(deps.panGesture, deps.appStage, deps.stageEl, deps.canvas, event);
    deps.onPanStateChange(true);
  }

  function onPointerMove(event: PointerEvent): void {
    const panResult = updatePan(
      deps.panGesture,
      deps.appStage,
      deps.panDragThresholdPx,
      event,
    );
    if (panResult.handled) {
      if (panResult.moved) {
        deps.onPanMove();
        deps.onHoverHex(null);
      }
      return;
    }

    const worldPoint = deps.mapCamera.canvasClientToWorld(event.clientX, event.clientY);
    const hovered = deps.toHex(worldPoint.x, worldPoint.y);

    if (!deps.isHoverHexValid(hovered)) {
      deps.onHoverHex(null);
      return;
    }

    deps.onHoverHex(hovered);
  }

  function finish(event: PointerEvent, triggerClick: boolean): void {
    const panResult = finishPan(deps.panGesture, deps.stageEl, deps.canvas, event);
    if (!panResult.handled) {
      return;
    }

    deps.onPanStateChange(false);
    if (triggerClick && !panResult.wasMoved) {
      deps.onPrimaryClick(event.clientX, event.clientY);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    finish(event, true);
  }

  function onPointerCancel(event: PointerEvent): void {
    finish(event, false);
  }

  function onPointerLeave(): void {
    if (deps.panGesture.active) {
      return;
    }
    deps.onHoverHex(null);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const zoomFactor = Math.exp(-event.deltaY * deps.wheelZoomSensitivity);
    deps.mapCamera.applyMapZoom(deps.mapCamera.getMapZoom() * zoomFactor, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onWheel,
  };
}
