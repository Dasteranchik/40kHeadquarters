import type { AdminApiRequest } from "./apiClient";
import {
  parseJsonObjectInput,
  readResourceEditor,
  selectedChipValues,
} from "./formControls";

interface AdminMutationDeps {
  apiRequest: AdminApiRequest;
  reload: () => Promise<void>;
  appendEvent: (message: string) => void;
  syncArmyDestinations: () => void;
}

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function warpVisibilityFromSelect(select: HTMLSelectElement): null | 0 | 1 | 2 | 3 {
  return select.value === "" ? null : Number(select.value) as 0 | 1 | 2 | 3;
}

export function bindAdminMutationControls(deps: AdminMutationDeps): void {
  const addPlayerName = element<HTMLInputElement>("addPlayerName");
  const addPlayerColor = element<HTMLInputElement>("addPlayerColor");
  const addPlayerUsername = element<HTMLInputElement>("addPlayerUsername");
  const addPlayerPassword = element<HTMLInputElement>("addPlayerPassword");
  const addPlayerAlignment = element<HTMLSelectElement>("addPlayerAlignment");
  const addPlayerFaction = element<HTMLSelectElement>("addPlayerFaction");
  const addPlayerCanTakeResources = element<HTMLInputElement>("addPlayerCanTakeResources");
  const addPlayerManualNavigator = element<HTMLInputElement>("addPlayerManualNavigator");

  const addFactionId = element<HTMLInputElement>("addFactionId");
  const addFactionName = element<HTMLInputElement>("addFactionName");
  const addFactionDescription = element<HTMLInputElement>("addFactionDescription");
  const addFactionChaos = element<HTMLInputElement>("addFactionChaos");
  const addFactionAdministratum = element<HTMLInputElement>("addFactionAdministratum");

  const addPlanetId = element<HTMLInputElement>("addPlanetId");
  const addPlanetName = element<HTMLInputElement>("addPlanetName");
  const addPlanetQ = element<HTMLInputElement>("addPlanetQ");
  const addPlanetR = element<HTMLInputElement>("addPlanetR");
  const addPlanetWorldType = element<HTMLSelectElement>("addPlanetWorldType");
  const addPlanetWorldTags = element<HTMLDivElement>("addPlanetWorldTags");
  const addPlanetPopulation = element<HTMLInputElement>("addPlanetPopulation");
  const addPlanetMorale = element<HTMLInputElement>("addPlanetMorale");
  const addPlanetMaxTitheLevel = element<HTMLSelectElement>("addPlanetMaxTitheLevel");
  const addPlanetTithePaid = element<HTMLInputElement>("addPlanetTithePaid");
  const addPlanetInf = element<HTMLInputElement>("addPlanetInf");
  const addPlanetVision = element<HTMLInputElement>("addPlanetVision");
  const addPlanetGeneration = element<HTMLDivElement>("addPlanetGeneration");
  const addPlanetRawStock = element<HTMLDivElement>("addPlanetRawStock");

  const addFleetId = element<HTMLInputElement>("addFleetId");
  const addFleetOwner = element<HTMLSelectElement>("addFleetOwner");
  const addFleetQ = element<HTMLInputElement>("addFleetQ");
  const addFleetR = element<HTMLInputElement>("addFleetR");
  const addFleetPower = element<HTMLInputElement>("addFleetPower");
  const addFleetHealth = element<HTMLInputElement>("addFleetHealth");
  const addFleetInfluence = element<HTMLInputElement>("addFleetInfluence");
  const addFleetAp = element<HTMLInputElement>("addFleetAp");
  const addFleetMaxMovement = element<HTMLInputElement>("addFleetMaxMovement");
  const addFleetNavigator = element<HTMLInputElement>("addFleetNavigator");
  const addFleetWarpVisibility = element<HTMLSelectElement>("addFleetWarpVisibility");
  const addFleetVariant = element<HTMLSelectElement>("addFleetVariant");
  const addFleetVision = element<HTMLInputElement>("addFleetVision");
  const addFleetCapacity = element<HTMLInputElement>("addFleetCapacity");
  const addFleetStance = element<HTMLSelectElement>("addFleetStance");
  const addFleetInventory = element<HTMLInputElement>("addFleetInventory");

  const addArmyOwner = element<HTMLSelectElement>("addArmyOwner");
  const addArmyDestinationKind = element<HTMLSelectElement>("addArmyDestinationKind");
  const addArmyDestination = element<HTMLSelectElement>("addArmyDestination");
  const addArmyPower = element<HTMLInputElement>("addArmyPower");
  const addArmyHealth = element<HTMLInputElement>("addArmyHealth");
  const addArmyInfluence = element<HTMLInputElement>("addArmyInfluence");
  const addArmyVision = element<HTMLInputElement>("addArmyVision");
  const addArmyStance = element<HTMLSelectElement>("addArmyStance");
  const addArmyVariant = element<HTMLSelectElement>("addArmyVariant");

  const relType = element<HTMLSelectElement>("relType");
  const relPlayerA = element<HTMLSelectElement>("relPlayerA");
  const relPlayerB = element<HTMLSelectElement>("relPlayerB");

  async function runMutation(
    action: () => Promise<void>,
    failurePrefix: string,
  ): Promise<void> {
    try {
      await action();
      await deps.reload();
    } catch (error) {
      deps.appendEvent(`${failurePrefix}: ${(error as Error).message}`);
    }
  }

  async function addPlayer(): Promise<void> {
    await runMutation(async () => {
      await deps.apiRequest("/api/admin/players", {
        method: "POST",
        body: JSON.stringify({
          name: addPlayerName.value.trim(),
          color: addPlayerColor.value,
          alignment: addPlayerAlignment.value,
          factionId: addPlayerFaction.value ? Number(addPlayerFaction.value) : undefined,
          canTakePlanetResources: addPlayerCanTakeResources.checked,
          manualNavigator: addPlayerManualNavigator.checked,
          username: addPlayerUsername.value.trim() || undefined,
          password: addPlayerPassword.value || undefined,
        }),
      });
      deps.appendEvent(`Player ${addPlayerName.value.trim()} created`);
    }, "Player create failed");
  }

  async function addFaction(): Promise<void> {
    await runMutation(async () => {
      await deps.apiRequest("/api/admin/factions", {
        method: "POST",
        body: JSON.stringify({
          code: addFactionId.value.trim(),
          name: addFactionName.value.trim(),
          description: addFactionDescription.value.trim() || undefined,
          isChaos: addFactionChaos.checked,
          isAdministratum: addFactionAdministratum.checked,
        }),
      });
      deps.appendEvent(`Faction ${addFactionId.value.trim()} created`);
    }, "Faction create failed");
  }

  async function addPlanet(): Promise<void> {
    await runMutation(async () => {
      const resourceGeneration = Object.fromEntries(
        selectedChipValues(addPlanetGeneration).map((key) => [key, 1]),
      );
      await deps.apiRequest("/api/admin/planets", {
        method: "POST",
        body: JSON.stringify({
          name: addPlanetName.value.trim(),
          id: addPlanetId.value.trim(),
          q: Number(addPlanetQ.value),
          r: Number(addPlanetR.value),
          worldType: addPlanetWorldType.value,
          worldTags: selectedChipValues(addPlanetWorldTags),
          population: Number(addPlanetPopulation.value),
          morale: Number(addPlanetMorale.value),
          titheLevel: "ADEPTUS_NON",
          maxTitheLevel: addPlanetMaxTitheLevel.value,
          tithePaid: Number(addPlanetTithePaid.value),
          titheContributions: {},
          resourceGeneration,
          rawStock: readResourceEditor(addPlanetRawStock),
          productStorageByPlayerId: {},
          influenceValue: Number(addPlanetInf.value),
          visionRange: Number(addPlanetVision.value || "1"),
        }),
      });
      deps.appendEvent(`Planet ${addPlanetId.value.trim()} created`);
    }, "Planet create failed");
  }

  async function addFleet(): Promise<void> {
    await runMutation(async () => {
      if (!addFleetOwner.value) {
        throw new Error("Owner player is required");
      }
      await deps.apiRequest("/api/admin/fleets", {
        method: "POST",
        body: JSON.stringify({
          id: addFleetId.value.trim(),
          ownerPlayerId: Number(addFleetOwner.value),
          q: Number(addFleetQ.value),
          r: Number(addFleetR.value),
          combatPower: Number(addFleetPower.value),
          health: Number(addFleetHealth.value),
          influence: Number(addFleetInfluence.value),
          movementPoints: Number(addFleetAp.value),
          visionRange: Number(addFleetVision.value),
          capacity: Number(addFleetCapacity.value),
          stance: addFleetStance.value,
          domain: "SPACE",
          maxMovementPoints: Number(addFleetMaxMovement.value),
          isNavigator: addFleetNavigator.checked,
          warpVisibility: warpVisibilityFromSelect(addFleetWarpVisibility),
          unitVariantId: addFleetVariant.value ? Number(addFleetVariant.value) : null,
          inventory: parseJsonObjectInput(addFleetInventory.value),
        }),
      });
      deps.appendEvent("Fleet created");
    }, "Fleet create failed");
  }

  async function addArmy(): Promise<void> {
    await runMutation(async () => {
      if (!addArmyOwner.value || !addArmyDestination.value) {
        throw new Error("Army owner and destination are required");
      }
      const kind = addArmyDestinationKind.value === "FLEET" ? "FLEET" : "PLANET";
      const destinationId = Number(addArmyDestination.value);
      const destination = kind === "FLEET"
        ? { kind, fleetId: destinationId }
        : { kind, planetId: destinationId };
      await deps.apiRequest("/api/admin/armies", {
        method: "POST",
        body: JSON.stringify({
          ownerPlayerId: Number(addArmyOwner.value),
          destination,
          combatPower: Number(addArmyPower.value),
          health: Number(addArmyHealth.value),
          influence: Number(addArmyInfluence.value),
          visionRange: Number(addArmyVision.value),
          stance: addArmyStance.value,
          unitVariantId: addArmyVariant.value ? Number(addArmyVariant.value) : null,
        }),
      });
      deps.appendEvent("Army created");
    }, "Army create failed");
  }

  async function mutateRelation(remove: boolean): Promise<void> {
    if (!relPlayerA.value || !relPlayerB.value) {
      deps.appendEvent("Relation mutation failed: player ids are required");
      return;
    }
    const payload = {
      type: relType.value,
      playerAId: Number(relPlayerA.value),
      playerBId: Number(relPlayerB.value),
    };
    await runMutation(async () => {
      await deps.apiRequest("/api/admin/relations", {
        method: remove ? "DELETE" : "POST",
        body: JSON.stringify(payload),
      });
      deps.appendEvent(
        `Relation ${remove ? "removed" : "added"}: ${payload.playerAId}/${payload.playerBId} ${payload.type}`,
      );
    }, "Relation mutation failed");
  }

  element<HTMLButtonElement>("addPlayerBtn").addEventListener("click", () => void addPlayer());
  element<HTMLButtonElement>("addFactionBtn").addEventListener("click", () => void addFaction());
  element<HTMLButtonElement>("addPlanetBtn").addEventListener("click", () => void addPlanet());
  element<HTMLButtonElement>("addFleetBtn").addEventListener("click", () => void addFleet());
  element<HTMLButtonElement>("addArmyBtn").addEventListener("click", () => void addArmy());
  addArmyDestinationKind.addEventListener("change", deps.syncArmyDestinations);
  element<HTMLButtonElement>("addRelationBtn").addEventListener(
    "click",
    () => void mutateRelation(false),
  );
  element<HTMLButtonElement>("removeRelationBtn").addEventListener(
    "click",
    () => void mutateRelation(true),
  );
}
