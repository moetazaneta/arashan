import type * as Client from "@arashan/client";
import { DomainError } from "@arashan/core";
import { useState } from "react";
import { vi } from "vite-plus/test";

// The hooks of @arashan/client for the tests of the web app, which have no backend. The version is
// fixed, there are no Samples, and each new Sample fails with the domain error `sample.nameTaken`.

const actual = await vi.importActual<typeof Client>("@arashan/client");

export const { ClientProvider, createClient, toDomainError } = actual;

export const fakeAppVersion = "1.2.3";

export const useAppVersion = () => ({ data: fakeAppVersion });

export const useSamples = () => ({ data: [], error: null });

export const useAddSample = () => {
  const [error, setError] = useState<DomainError | null>(null);
  return {
    error,
    isPending: false,
    mutate: () => setError(new DomainError("sample.nameTaken")),
  };
};

export const useDeleteSample = () => ({ error: null, isPending: false, mutate: () => {} });
