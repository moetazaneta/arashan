import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

/** The connection to the backend. Make one for the app, with the URL of the Convex deployment. */
export interface Client {
  convex: ConvexReactClient;
  queryClient: QueryClient;
}

export function createClient(url: string): Client {
  const convex = new ConvexReactClient(url);
  const convexQueryClient = new ConvexQueryClient(convex);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        // A Convex query is live: the server pushes each new result, and an error does not go away
        // when the client asks again.
        retry: false,
      },
    },
  });
  convexQueryClient.connect(queryClient);
  return { convex, queryClient };
}

/** Gives the hooks of this package their client. */
export function ClientProvider({ client, children }: { client: Client; children: ReactNode }) {
  return (
    <ConvexProvider client={client.convex}>
      <QueryClientProvider client={client.queryClient}>{children}</QueryClientProvider>
    </ConvexProvider>
  );
}
