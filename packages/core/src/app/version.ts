import corePackage from "../../package.json" with { type: "json" };

/** The version of the app: the version of this package. */
export function getAppVersion(): string {
  return corePackage.version;
}
