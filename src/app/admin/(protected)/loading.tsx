import { DashboardSkeleton } from "@/components/admin/page-skeletons";

// Shown at once when someone opens a page in the admin area (the menu and header stay in place) and the page is
// still loading its data. Pages with their own loading.tsx in a folder below use a shape that fits them.
// No spinner and no text: the thin top bar (navigation-progress.tsx) is the "click received" signal.
export default function AdminLoading() {
  return <DashboardSkeleton />;
}
