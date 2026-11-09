import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle } from "@/components/admin/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { settingsTrail } from "@/lib/crumbs";
import { guardPanelPage } from "@/server/auth/panel";
import { getDb } from "@/server/db/client";
import { readSetting } from "@/server/services/settings";

import { saveSettingAction } from "../actions";

export const metadata: Metadata = { title: "Site content" };

export default async function SiteContentPage() {
  const admin = await guardPanelPage("site_content.edit", "/admin/settings/site");
  const db = getDb();
  const [contact, hours, social, home, version] = await Promise.all([
    readSetting(db, "contact"),
    readSetting(db, "business_hours"),
    readSetting(db, "social_links"),
    readSetting(db, "home_texts"),
    readSetting(db, "privacy_notice_version"),
  ]);

  return (
    <>
      <AdminTitle
        title="Site content"
        crumbs={[...settingsTrail(admin.role), { label: "Site content" }]}
        intro="What visitors read on the website. Changes show at once."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveSettingAction} hidden={{ key: "contact" }} submitLabel="Save">
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-phone">Phone</Label>
                <Input id="c-phone" name="phone" defaultValue={contact.phone} maxLength={40} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" name="email" defaultValue={contact.email} maxLength={200} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-address">Address</Label>
                <Textarea
                  id="c-address"
                  name="address"
                  defaultValue={contact.address}
                  maxLength={500}
                />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Business hours</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={saveSettingAction}
              hidden={{ key: "business_hours" }}
              submitLabel="Save"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="h-text">Hours</Label>
                <Textarea id="h-text" name="text" defaultValue={hours.text} maxLength={500} />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Messenger and Viber links</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={saveSettingAction}
              hidden={{ key: "social_links" }}
              submitLabel="Save"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-m">Messenger link</Label>
                <Input
                  id="s-m"
                  name="messenger"
                  defaultValue={social.messenger}
                  maxLength={500}
                  placeholder="https://m.me/..."
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-v">Viber number</Label>
                <Input
                  id="s-v"
                  name="viber"
                  defaultValue={social.viber}
                  maxLength={500}
                  placeholder="+63 9XX XXX XXXX"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                The Messenger button is hidden when its link is empty. Viber shows the number only
                (no button). Leave it empty to hide it.
              </p>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Home page text</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={saveSettingAction}
              hidden={{ key: "home_texts" }}
              submitLabel="Save"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="t-h">Headline</Label>
                <Input id="t-h" name="headline" defaultValue={home.headline} maxLength={200} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="t-i">Intro</Label>
                <Textarea id="t-i" name="intro" defaultValue={home.intro} maxLength={1000} />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Privacy notice version</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The version is saved with every request, so we know which text the client agreed to.
              Remove the word &quot;draft&quot; only when the owner has approved the text.
            </p>
            <ActionForm
              action={saveSettingAction}
              hidden={{ key: "privacy_notice_version" }}
              submitLabel="Save"
              inline
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="p-v">Version</Label>
                <Input id="p-v" name="value" defaultValue={version} maxLength={40} />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
