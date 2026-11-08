import "server-only";

import { sql } from "drizzle-orm";

import type { AppDb } from "@/server/db/types";

// Tells the database WHO is acting, for this transaction only (the third argument "true" means "local").
// The triggers in drizzle/0006_single_role.sql read it and refuse what the role may not do (a second
// layer after the checks in the code). It also lets the payment method log trigger write the admin id.
// Call it as the FIRST statement inside db.transaction() in every admin write.
export async function setActor(tx: Pick<AppDb, "execute">, actorId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.actor_id', ${actorId}, true)`);
}
