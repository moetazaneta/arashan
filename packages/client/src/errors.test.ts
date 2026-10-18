import { DomainError } from "@arashan/core";
import { ConvexError } from "convex/values";
import { expect, test } from "vite-plus/test";

import { callCommand, toDomainError } from "./errors";

test("a ConvexError with a known code becomes a DomainError", () => {
  const error = toDomainError(new ConvexError({ code: "sample.nameTaken" }));

  expect(error).toBeInstanceOf(DomainError);
  expect(error?.code).toBe("sample.nameTaken");
});

test("an error with an unknown code or no code is not a domain error", () => {
  expect(toDomainError(new ConvexError({ code: "no.suchCode" }))).toBeNull();
  expect(toDomainError(new ConvexError("text"))).toBeNull();
  expect(toDomainError(new Error("network"))).toBeNull();
});

test("callCommand rethrows a domain error from the backend as a DomainError", async () => {
  const mutation = () => Promise.reject(new ConvexError({ code: "sample.notFound" }));

  await expect(callCommand(mutation, {})).rejects.toMatchObject({
    name: "DomainError",
    code: "sample.notFound",
  });
});

test("callCommand rethrows any other error as it is", async () => {
  const failure = new Error("network");

  await expect(callCommand(() => Promise.reject(failure), {})).rejects.toBe(failure);
});
