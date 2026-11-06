import { Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";

import { ContactForm } from "@/components/public/contact-form";
import { BackupContactBlock } from "@/components/shared/backup-contact-block";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeading } from "@/components/shared/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicSettings } from "@/server/services/site-content";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Send us a message, or find our contact details, business hours and Messenger and Viber links.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const { contact, business_hours, social_links } = await getPublicSettings();

  // Only details the owner has filled in are shown.
  const details = [
    { icon: Phone, label: "Phone", value: contact.phone },
    { icon: Mail, label: "Email", value: contact.email },
    { icon: MapPin, label: "Address", value: contact.address },
    { icon: Clock, label: "Business hours", value: business_hours.text },
  ].filter((item) => item.value);

  return (
    <>
      <PageHeading
        title="Contact us"
        intro="Send us a message and we will reply. You can also write to us on Messenger or Viber."
      />
      <PageContainer className="grid gap-10 py-10 md:py-14 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h2 className="mb-5 text-xl font-bold">Send a message</h2>
          <ContactForm />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          {details.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Our details</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-4">
                  {details.map(({ icon: Icon, label, value }) => (
                    <li key={label} className="flex items-start gap-3">
                      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="text-base break-words whitespace-pre-line">{value}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <BackupContactBlock messengerUrl={social_links.messenger} viberUrl={social_links.viber} />
        </div>
      </PageContainer>
    </>
  );
}
