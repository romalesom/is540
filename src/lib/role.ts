import "server-only";
import { cookies } from "next/headers";
import type { Role } from "./types";

export const ROLE_COOKIE = "role";

// Demo-only role switch (no login). Server actions still check it so the
// viewer perspective cannot write through the UI.
export async function getRole(): Promise<Role> {
  const value = (await cookies()).get(ROLE_COOKIE)?.value;
  return value === "manager" ? "manager" : "viewer";
}

export async function requireManager() {
  if ((await getRole()) !== "manager") {
    throw new Error("Only stock managers can change data.");
  }
}
