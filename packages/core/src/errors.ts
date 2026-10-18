/**
 * The codes of all domain errors of the app, in one list. The core gives a code, never a text for
 * people (ADR 0004): the web app has a translated message for each code, and its type check fails
 * if a code has no message. To add an error, add its code here and its message in the web app.
 */
export const errorCodes = [
  // The sample module.
  "sample.nameRequired",
  "sample.nameTaken",
  "sample.notFound",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (errorCodes as readonly string[]).includes(value);
}

/**
 * A command or a query broke a business rule. The backend sends only the code to the client, and the
 * view shows the translated message for it.
 */
export class DomainError extends Error {
  override readonly name = "DomainError";
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}
