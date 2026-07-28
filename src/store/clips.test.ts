import { describe, expect, test } from "bun:test";
import {
  applyProtectionConstraints,
  clearE2eFields,
  needsLegacyPinGate,
} from "./clips";
import {
  decryptWithDek,
  enablePassphraseProtection,
  encryptWithDek,
  isWeakPassphrase,
  unlockPassphraseProtection,
} from "../lib/e2e-crypto";

describe("needsLegacyPinGate", () => {
  test("true only for pinHash without encryption", () => {
    expect(needsLegacyPinGate({ pinHash: "x", encrypted: false })).toBe(true);
    expect(needsLegacyPinGate({ pinHash: "x", encrypted: true })).toBe(false);
    expect(needsLegacyPinGate({ pinHash: null, encrypted: true })).toBe(false);
    expect(needsLegacyPinGate({ pinHash: null, encrypted: false })).toBe(false);
  });
});

describe("applyProtectionConstraints", () => {
  const base = {
    pinHash: null as string | null,
    encrypted: false,
    e2eSalt: null as string | null,
    e2eWrappedKey: null as string | null,
    e2eKdf: null as string | null,
  };

  test("e2e material enables encryption and clears pin", () => {
    const next = applyProtectionConstraints(
      { ...base, pinHash: "legacy" },
      {
        e2eSalt: "salt",
        e2eWrappedKey: "wrap",
        e2eKdf: '{"iters":600000}',
      }
    );
    expect(next.encrypted).toBe(true);
    expect(next.pinHash).toBeNull();
  });

  test("clearing encryption clears e2e fields", () => {
    const next = applyProtectionConstraints(
      {
        ...base,
        encrypted: true,
        e2eSalt: "salt",
        e2eWrappedKey: "wrap",
        e2eKdf: "{}",
      },
      { encrypted: false }
    );
    expect(next.e2eSalt).toBeNull();
    expect(next.e2eWrappedKey).toBeNull();
    expect(next.e2eKdf).toBeNull();
  });

  test("clearE2eFields wipes protect state", () => {
    expect(clearE2eFields()).toEqual({
      encrypted: false,
      e2eSalt: null,
      e2eWrappedKey: null,
      e2eKdf: null,
      pinHash: null,
    });
  });
});

describe("e2e-crypto", () => {
  test("isWeakPassphrase flags short and digit-only secrets", () => {
    expect(isWeakPassphrase("1234")).toBe(true);
    expect(isWeakPassphrase("abcd")).toBe(true);
    expect(isWeakPassphrase("correct-horse-battery-staple")).toBe(false);
  });

  test("wrap/unwrap and encrypt/decrypt round-trip", async () => {
    const passphrase = "correct-horse-battery-staple";
    const enabled = await enablePassphraseProtection(passphrase, 10_000);
    const dek = await unlockPassphraseProtection(
      passphrase,
      enabled.saltB64,
      enabled.wrappedKeyB64,
      enabled.kdf
    );
    expect(Buffer.from(dek).equals(Buffer.from(enabled.dek))).toBe(true);

    const cipher = await encryptWithDek("hello secret", dek);
    const plain = await decryptWithDek(cipher, dek);
    expect(plain).toBe("hello secret");
  });

  test("wrong passphrase fails to unwrap", async () => {
    const enabled = await enablePassphraseProtection("right-passphrase-here", 10_000);
    await expect(
      unlockPassphraseProtection(
        "wrong-passphrase-here",
        enabled.saltB64,
        enabled.wrappedKeyB64,
        enabled.kdf
      )
    ).rejects.toBeDefined();
  });
});
