import { hashPassword, validatePasswordPolicy } from "../auth/password";
import type { Account } from "./contracts";

export interface BootstrapAdminConfig {
  username?: string;
  password?: string;
}

export function ensureBootstrapAdmin(
  accounts: Map<string, Account>,
  config: BootstrapAdminConfig,
): boolean {
  if ([...accounts.values()].some((account) => account.role === "admin")) return false;

  const username = config.username?.trim();
  const password = config.password;
  if (!username || !password) {
    throw new Error(
      "No administrator account exists. Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD for the first startup.",
    );
  }
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(username)) {
    throw new Error("BOOTSTRAP_ADMIN_USERNAME must match [a-zA-Z0-9_-]{2,32}");
  }
  const passwordError = validatePasswordPolicy(password);
  if (passwordError) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD: ${passwordError}`);
  if (accounts.has(username)) {
    throw new Error(`Bootstrap admin username ${username} is already occupied`);
  }

  accounts.set(username, {
    username,
    passwordHash: hashPassword(password),
    role: "admin",
  });
  return true;
}
