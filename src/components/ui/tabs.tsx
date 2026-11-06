"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn, focusRing } from "@/lib/utils";

// Two looks: "segmented" for filters, "underline" for detail pages.
const tabsListVariants = cva("inline-flex max-w-full items-center", {
  variants: {
    variant: {
      segmented: "gap-1 rounded-md bg-muted p-1",
      underline: "w-full gap-1 overflow-x-auto border-b",
    },
  },
  defaultVariants: { variant: "segmented" },
});

const tabsTriggerVariants = cva(
  [
    "inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-base font-bold whitespace-nowrap text-muted-foreground",
    "transition-[background-color,box-shadow,color] duration-200 ease-standard motion-reduce:transition-none",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    focusRing,
  ],
  {
    variants: {
      variant: {
        segmented:
          "rounded-sm data-[state=active]:bg-background data-[state=active]:text-primary-ink data-[state=active]:shadow-sm",
        underline:
          "-mb-px rounded-t-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary-ink",
      },
    },
    defaultVariants: { variant: "segmented" },
  },
);

type TabsVariant = NonNullable<VariantProps<typeof tabsListVariants>["variant"]>;

const TabsVariantContext = React.createContext<TabsVariant>("segmented");

function Tabs({
  className,
  variant = "segmented",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn("flex flex-col gap-4", className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(focusRing, "rounded-md", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
