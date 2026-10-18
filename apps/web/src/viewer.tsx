import type { FarmId, Role, Viewer } from "@arashan/core";
import { createContext, type ReactNode, useContext } from "react";

// The User who is logged in, for the screens of the app shell. The root route gives it only when the
// session is ready, so a screen never sees a missing User.

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

/** The User who is logged in and the User's Farms. Only for a screen inside the app shell. */
export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (viewer === null) throw new Error("useViewer() is for the screens inside the app shell.");
  return viewer;
}

/** The Role of the User in the Farm, or null if the User is not a Member of it. */
export function useRole(farmId: string | undefined): Role | null {
  return useViewer().farms.find((farm) => farm.id === farmId)?.role ?? null;
}

const lastFarmKey = (viewer: Viewer) => `arashan.lastFarm.${viewer.user.id}`;

/** Remembers the Farm that the User opened, for the next visit to `/`. */
export function rememberFarm(viewer: Viewer, farmId: FarmId) {
  localStorage.setItem(lastFarmKey(viewer), farmId);
}

/** The Farm to open at `/`: the one that the User opened last, or the first one, or null. */
export function farmToOpen(viewer: Viewer): FarmId | null {
  const last = localStorage.getItem(lastFarmKey(viewer));
  return (viewer.farms.find((farm) => farm.id === last) ?? viewer.farms[0])?.id ?? null;
}
