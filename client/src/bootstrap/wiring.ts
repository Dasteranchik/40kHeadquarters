import type { CanvasController } from "../input/canvasController";

export interface MainEventElements {
  loginBtn: HTMLButtonElement;
  logoutBtn: HTMLButtonElement;
  submitMoveBtn: HTMLButtonElement;
  clearPathBtn: HTMLButtonElement;
  setAttackBtn: HTMLButtonElement;
  setDefenseBtn: HTMLButtonElement;
  warBtn: HTMLButtonElement;
  allyBtn: HTMLButtonElement;
  readyBtn: HTMLButtonElement;
  endTurnBtn: HTMLButtonElement;
  adminAddPlayerBtn: HTMLButtonElement;
  adminAddPlanetBtn: HTMLButtonElement;
  adminAddFleetBtn: HTMLButtonElement;
  hexContextCloseBtn: HTMLButtonElement;
  mapZoomOutBtn: HTMLButtonElement;
  mapZoomInBtn: HTMLButtonElement;
  mapZoomResetBtn: HTMLButtonElement;
  canvas: HTMLCanvasElement;
}

export interface MainEventHandlers {
  onLogin: () => void;
  onLogout: () => void;
  onSubmitMove: () => void;
  onClearPath: () => void;
  onSetAttack: () => void;
  onSetDefense: () => void;
  onDeclareWar: () => void;
  onProposeAlliance: () => void;
  onReady: () => void;
  onEndTurn: () => void;
  onAdminAddPlayer: () => void;
  onAdminAddPlanet: () => void;
  onAdminAddFleet: () => void;
  onCloseHexContextMenu: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomReset: () => void;
  isHexContextMenuOpen: () => boolean;
  onEscape: () => void;
  onWindowResizeWithOpenHexMenu: () => void;
  canvasController: CanvasController;
}

export function bindMainEvents(
  elements: MainEventElements,
  handlers: MainEventHandlers,
): void {
  elements.loginBtn.addEventListener("click", handlers.onLogin);
  elements.logoutBtn.addEventListener("click", handlers.onLogout);

  elements.submitMoveBtn.addEventListener("click", handlers.onSubmitMove);
  elements.clearPathBtn.addEventListener("click", handlers.onClearPath);
  elements.setAttackBtn.addEventListener("click", handlers.onSetAttack);
  elements.setDefenseBtn.addEventListener("click", handlers.onSetDefense);
  elements.warBtn.addEventListener("click", handlers.onDeclareWar);
  elements.allyBtn.addEventListener("click", handlers.onProposeAlliance);
  elements.readyBtn.addEventListener("click", handlers.onReady);
  elements.endTurnBtn.addEventListener("click", handlers.onEndTurn);

  elements.adminAddPlayerBtn.addEventListener("click", handlers.onAdminAddPlayer);
  elements.adminAddPlanetBtn.addEventListener("click", handlers.onAdminAddPlanet);
  elements.adminAddFleetBtn.addEventListener("click", handlers.onAdminAddFleet);

  elements.hexContextCloseBtn.addEventListener("click", handlers.onCloseHexContextMenu);
  elements.mapZoomOutBtn.addEventListener("click", handlers.onZoomOut);
  elements.mapZoomInBtn.addEventListener("click", handlers.onZoomIn);
  elements.mapZoomResetBtn.addEventListener("click", handlers.onZoomReset);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      handlers.onEscape();
    }
  });

  window.addEventListener("resize", () => {
    if (handlers.isHexContextMenuOpen()) {
      handlers.onWindowResizeWithOpenHexMenu();
    }
  });

  elements.canvas.addEventListener("pointerdown", handlers.canvasController.onPointerDown);
  elements.canvas.addEventListener("pointermove", handlers.canvasController.onPointerMove);
  elements.canvas.addEventListener("pointerup", handlers.canvasController.onPointerUp);
  elements.canvas.addEventListener("pointercancel", handlers.canvasController.onPointerCancel);
  elements.canvas.addEventListener("pointerleave", handlers.canvasController.onPointerLeave);
  elements.canvas.addEventListener("wheel", handlers.canvasController.onWheel, {
    passive: false,
  });
}
