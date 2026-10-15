"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ROLE_COOKIE } from "@/lib/role";
import type { Role } from "@/lib/types";

export async function setRole(role: Role) {
  (await cookies()).set(ROLE_COOKIE, role === "manager" ? "manager" : "viewer", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/", "layout");
}
