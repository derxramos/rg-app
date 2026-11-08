"use client";

import { Smartphone } from "lucide-react";
import { useCallback, useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeDeviceAction } from "@/app/admin/(protected)/security/actions";

export type DeviceView = { id: string; name: string; added: string; verified: boolean };

// My authenticator devices: name and date, and a Remove button. Removing needs a code from ANOTHER device,
// and the last device cannot be removed (the button is missing and the server refuses too).
export function DeviceList({ devices }: { devices: DeviceView[] }) {
  const verifiedCount = devices.filter((d) => d.verified).length;
  return (
    <ul className="flex flex-col gap-3">
      {devices.map((device) => (
        <li
          key={device.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Smartphone aria-hidden="true" className="size-6 shrink-0 text-primary-ink" />
            <div className="min-w-0">
              <p className="font-bold break-words">{device.name}</p>
              <p className="text-sm text-muted-foreground">Added {device.added}</p>
            </div>
            {device.verified ? null : <Badge variant="warning">Not finished</Badge>}
          </div>
          {device.verified && verifiedCount <= 1 ? (
            <span className="text-sm text-muted-foreground">Your only device</span>
          ) : (
            <RemoveDevice device={device} />
          )}
        </li>
      ))}
    </ul>
  );
}

function RemoveDevice({ device }: { device: DeviceView }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Remove ${device.name}`}>
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this device</DialogTitle>
          <DialogDescription>
            {device.name} will no longer give you codes. To be sure it is you, type a code from a
            DIFFERENT device.
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={removeDeviceAction}
          hidden={{ factorId: device.id }}
          variant="destructive"
          submitLabel="Remove the device"
          onSuccess={close}
        >
          {device.verified ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rm-${device.id}`}>
                Code from another device (not {device.name})
              </Label>
              <Input
                id={`rm-${device.id}`}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                required
                className="max-w-48"
              />
            </div>
          ) : null}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
