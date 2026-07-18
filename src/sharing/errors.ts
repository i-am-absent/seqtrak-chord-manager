import type { PublicPack } from "./types";

export class SharingConfigurationError extends Error {}
export class SharingValidationError extends Error {}
export class PackOwnershipError extends Error {}
export class PackOwnershipPersistenceError extends Error {
  readonly createdPack: PublicPack;

  constructor(createdPack: PublicPack) {
    super("The pack was published, but browser ownership could not be saved.");
    this.name = "PackOwnershipPersistenceError";
    this.createdPack = createdPack;
    Object.defineProperty(this, "cause", {
      value: new Error("Browser storage rejected the ownership record.")
    });
  }
}
export class SharedPackNotFoundError extends Error {}
export class SharingServiceError extends Error {}
export class SharingResponseError extends Error {}
