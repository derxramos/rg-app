import { DatabaseZap } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageContainer } from "@/components/shared/page-container";
import { WarningBox } from "@/components/shared/warning-box";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicSetting } from "@/server/services/settings";

// Phase 1 test page. It proves the host works and the database can be read.
// Phase 2 replaces it with the real home page.
export default function HomePage() {
  return (
    <PageContainer className="flex flex-col gap-6 py-10">
      <h1 className="text-2xl font-bold md:text-3xl">Hello</h1>
      <p className="text-base text-muted-foreground">
        This is the Phase 1 test page. The card below reads one setting from the database.
      </p>
      <Suspense fallback={<Skeleton className="h-32 w-full max-w-xl rounded-lg" />}>
        <SettingCheck />
      </Suspense>
    </PageContainer>
  );
}

// Reads the "home_texts" setting. It runs at request time, because the database is not
// available while the site is being built.
async function SettingCheck() {
  await connection();

  // Read the data first. The page (JSX) is built after the try/catch, so errors are caught here.
  let headline: string | null = null;
  try {
    headline = (await getPublicSetting("home_texts")).headline;
  } catch (error) {
    // The details go to the server log only. The visitor sees a short message.
    console.error("Could not read the home_texts setting:", error);
  }

  if (headline === null) {
    return (
      <WarningBox variant="danger" title="The database is not connected" className="max-w-xl">
        Check DATABASE_URL in .env.local and run the migration. See the README.
      </WarningBox>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseZap aria-hidden="true" className="size-5" />
          Database connected
        </CardTitle>
        <CardDescription>Setting: home_texts.headline</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-bold">{headline || "(empty)"}</p>
      </CardContent>
    </Card>
  );
}
