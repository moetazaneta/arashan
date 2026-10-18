import { DomainError, type FarmId, type UserId, type Viewer } from "@arashan/core";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vite-plus/test";

import { type Registration, sessionState } from "./session-state";

const viewer: Viewer = {
  user: { id: "user-1" as UserId, username: "aibek", isOperator: false },
  farms: [{ id: "farm-1" as FarmId, name: "Арашан", role: "admin" }],
};

const signedIn = {
  clerk: { isLoaded: true, isSignedIn: true },
  convex: { isLoading: false, isAuthenticated: true },
  registration: { status: "done" } as Registration,
  viewer: { data: viewer, error: null },
};

describe("sessionState", () => {
  test("is loading until Clerk and the Convex auth know who is logged in", () => {
    expect(
      sessionState({ ...signedIn, clerk: { isLoaded: false, isSignedIn: undefined } }),
    ).toEqual({ status: "loading" });
    expect(
      sessionState({ ...signedIn, convex: { isLoading: true, isAuthenticated: false } }),
    ).toEqual({ status: "loading" });
  });

  test("is signed out when nobody is logged in", () => {
    expect(
      sessionState({
        ...signedIn,
        clerk: { isLoaded: true, isSignedIn: false },
        convex: { isLoading: false, isAuthenticated: false },
        viewer: { data: undefined, error: null },
      }),
    ).toEqual({ status: "signedOut" });
  });

  test("fails when the backend refuses the token of a person logged in to Clerk", () => {
    const session = sessionState({
      ...signedIn,
      convex: { isLoading: false, isAuthenticated: false },
    });

    expect(session.status).toBe("failed");
  });

  test("is registering until the backend has the User", () => {
    expect(
      sessionState({
        ...signedIn,
        registration: { status: "pending" },
        viewer: { data: null, error: null },
      }),
    ).toEqual({ status: "registering" });
  });

  test("fails with the domain error of the registration", () => {
    const session = sessionState({
      ...signedIn,
      registration: { status: "failed", error: new ConvexError({ code: "user.usernameMissing" }) },
      viewer: { data: null, error: null },
    });

    expect(session).toEqual({ status: "failed", error: expect.any(DomainError) });
    expect(session.status === "failed" && (session.error as DomainError).code).toBe(
      "user.usernameMissing",
    );
  });

  test("is ready with the viewer", () => {
    expect(sessionState(signedIn)).toEqual({ status: "ready", viewer });
  });
});
