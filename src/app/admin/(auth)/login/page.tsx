import { redirect } from "next/navigation";

// There is one login page for everyone: /login. Admins use it too, and land on /admin after.
export default function AdminLoginPage() {
  redirect("/login?next=%2Fadmin");
}
