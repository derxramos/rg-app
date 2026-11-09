import { Download } from "lucide-react";
import type { Metadata } from "next";

import { AdminTitle } from "@/components/admin/bits";
import { WarningBox } from "@/components/shared/warning-box";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardPanelPage } from "@/server/auth/panel";

export const metadata: Metadata = { title: "Export" };

export default async function ExportPage() {
  await guardPanelPage("export.csv", "/admin/export");
  return (
    <>
      <AdminTitle
        title="Export"
        intro="Download your data as CSV files for Excel or Google Sheets."
      />
      <WarningBox variant="info" title="Export a backup every week">
        The free database plan has no automatic backups. The files contain personal data of your
        clients. Keep them safe and delete them when you no longer need them. Every export is
        written to the activity log.
      </WarningBox>
      <Card>
        <CardHeader>
          <CardTitle>Choose a date range (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          {/* A normal form that goes to the download address. The server checks that you are the owner. */}
          <form method="get" action="/api/admin/export" className="flex flex-col gap-4">
            <div className="grid max-w-md grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="x-from">From</Label>
                <Input id="x-from" name="from" type="date" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="x-to">To</Label>
                <Input id="x-to" name="to" type="date" />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {/* Payments are the main backup: they show who has paid, which settles questions from clients.
                  So that button is the one teal (primary) button. */}
              <Button type="submit" name="type" value="payments">
                <Download aria-hidden="true" />
                Download payments
              </Button>
              <Button type="submit" name="type" value="requests" variant="outline">
                <Download aria-hidden="true" />
                Download requests
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
