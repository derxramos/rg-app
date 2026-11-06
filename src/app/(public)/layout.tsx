import { PublicShell } from "@/components/shared/public-shell";

// Layout for the public pages: header, page, footer.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <PublicShell>{children}</PublicShell>;
}
