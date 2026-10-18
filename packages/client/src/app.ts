import { api } from "@arashan/backend/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";

/** The version of the app. */
export function useAppVersion() {
  return useQuery(convexQuery(api.app.version, {}));
}
