export interface AdminActionDeps {
  isAdmin: () => boolean;
  apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  appendEvent: (message: string) => void;
}

export interface AdminPlayerFormInputs {
  idInput: HTMLInputElement;
  nameInput: HTMLInputElement;
  usernameInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
}

export interface AdminPlanetFormInputs {
  idInput: HTMLInputElement;
  qInput: HTMLInputElement;
  rInput: HTMLInputElement;
  resourceInput: HTMLInputElement;
  influenceInput: HTMLInputElement;
}

export interface AdminFleetFormInputs {
  idInput: HTMLInputElement;
  ownerSelect: HTMLSelectElement;
  qInput: HTMLInputElement;
  rInput: HTMLInputElement;
  powerInput: HTMLInputElement;
  healthInput: HTMLInputElement;
  influenceInput: HTMLInputElement;
  visionInput: HTMLInputElement;
  capacityInput: HTMLInputElement;
}

export function createAdminActions(deps: AdminActionDeps) {
  async function adminPost(path: string, payload: unknown): Promise<void> {
    if (!deps.isAdmin()) {
      return;
    }

    try {
      await deps.apiRequest(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      deps.appendEvent(`Admin POST ${path} success`);
    } catch (error) {
      deps.appendEvent(`Admin POST ${path} failed: ${(error as Error).message}`);
    }
  }

  async function adminDelete(path: string): Promise<void> {
    if (!deps.isAdmin()) {
      return;
    }

    try {
      await deps.apiRequest(path, {
        method: "DELETE",
      });
      deps.appendEvent(`Admin DELETE ${path} success`);
    } catch (error) {
      deps.appendEvent(`Admin DELETE ${path} failed: ${(error as Error).message}`);
    }
  }

  return {
    adminPost,
    adminDelete,
  };
}

export function buildAdminCreatePlayerPayload(
  inputs: AdminPlayerFormInputs,
): {
  id: string;
  name: string;
  username?: string;
  password?: string;
} {
  const username = inputs.usernameInput.value.trim();
  const password = inputs.passwordInput.value.trim();
  return {
    id: inputs.idInput.value.trim(),
    name: inputs.nameInput.value.trim(),
    username: username || undefined,
    password: password || undefined,
  };
}

export function buildAdminCreatePlanetPayload(
  inputs: AdminPlanetFormInputs,
): {
  id: string;
  q: number;
  r: number;
  resourceProduction: number;
  influenceValue: number;
} {
  return {
    id: inputs.idInput.value.trim(),
    q: Number(inputs.qInput.value),
    r: Number(inputs.rInput.value),
    resourceProduction: Number(inputs.resourceInput.value),
    influenceValue: Number(inputs.influenceInput.value),
  };
}

export function buildAdminCreateFleetPayload(
  inputs: AdminFleetFormInputs,
): {
  id: string;
  ownerPlayerId: string;
  q: number;
  r: number;
  combatPower: number;
  health: number;
  influence: number;
  visionRange: number;
  capacity: number;
} {
  return {
    id: inputs.idInput.value.trim(),
    ownerPlayerId: inputs.ownerSelect.value,
    q: Number(inputs.qInput.value),
    r: Number(inputs.rInput.value),
    combatPower: Number(inputs.powerInput.value || "10"),
    health: Number(inputs.healthInput.value || "100"),
    influence: Number(inputs.influenceInput.value || "5"),
    visionRange: Number(inputs.visionInput.value || "2"),
    capacity: Number(inputs.capacityInput.value || "10"),
  };
}
