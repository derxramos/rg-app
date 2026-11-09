// The words on the admin Help page (/admin/help, also opened with the F1 key).
// Plain data, no server or browser code, so the page and the tests can both use it.
// To change a help text, edit it here. A test fails if a status or a setting has no entry.

import type { Action } from "@/lib/permissions";
import { REQUEST_STATUSES, type RequestStatus } from "@/lib/status";

export type HelpItem = {
  name: string;
  // What it is.
  what: string;
  // What the person should do (optional).
  todo?: string;
  // A real-life example.
  example: string;
};

export type HelpSection = {
  id: string;
  // The screen name, shown as the section title.
  title: string;
  // Shown only to roles that may do this action (src/lib/permissions.ts).
  action: Action;
  items: HelpItem[];
};

// One entry for every request status. Typed as a Record, so a new status without help text will not compile.
export const STATUS_HELP: Record<RequestStatus, HelpItem> = {
  draft: {
    name: "Draft",
    what: "The client started a request but has not sent it yet.",
    todo: "Nothing. Old drafts are cancelled by the system.",
    example: "A client picks a service and uploads two files, then closes the page.",
  },
  submitted: {
    name: "Submitted",
    what: "The client sent the request. Nobody has looked at it yet.",
    todo: "Open it and check the details and files. Then set it to Under review.",
    example: "A new request for SSS registration arrives this morning.",
  },
  under_review: {
    name: "Under review",
    what: "Someone from the team is checking the request.",
    todo: "Check the documents. If something is missing, set it to On hold.",
    example: "You are comparing the client's ID with the form they filled in.",
  },
  waiting_for_client: {
    name: "On hold",
    what: "The request is paused. We are waiting for the client.",
    todo: "Write a message that says what is needed. Do nothing else until the client replies or sends files.",
    example:
      "A client sends a BIR form with one page missing. You set it to On hold and write: " +
      "“Please send page 2.” When the client sends the page, the request moves on.",
  },
  payment_submitted: {
    name: "Payment submitted",
    what: "The client says they paid and sent the receipt details.",
    todo: "Compare the amount and reference number with your payment app. Then verify or reject the payment (owner or admin).",
    example: "The client paid ₱1,500 by GCash and typed the reference number.",
  },
  payment_verified: {
    name: "Payment verified",
    what: "The payment was checked and is correct.",
    todo: "Start the work, then set the request to In progress.",
    example: "The GCash reference number matches your account.",
  },
  in_progress: {
    name: "In progress",
    what: "The team is doing the work.",
    todo: "When the work is done, set it to Completed.",
    example: "You are preparing the client's monthly bookkeeping files.",
  },
  completed: {
    name: "Completed",
    what: "The work is finished. The client's files are deleted after the days set in File settings.",
    todo: "Nothing. An admin can open it again if needed.",
    example: "The client received the finished documents.",
  },
  cancelled: {
    name: "Cancelled",
    what: "The request was stopped and will not continue.",
    todo: "Nothing.",
    example: "The client changed their mind, or an old draft expired.",
  },
};

// The order used on the Help page (the usual path of a request).
export const STATUS_ORDER: readonly RequestStatus[] = REQUEST_STATUSES;

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    action: "dashboard.view",
    items: [
      {
        name: "Status cards",
        what: "Five cards count the open requests by status. Click a card to see only those requests.",
        todo: "Look at the numbers first thing in the morning. Statuses are explained in “Request statuses” below.",
        example: "The On hold card shows 3: three clients still need to reply.",
      },
      {
        name: "Needs action",
        what: "A short list of the requests that wait for you right now.",
        todo: "Open the first one and work down the list.",
        example: "A new request and a payment to check are both listed.",
      },
      {
        name: "File storage",
        what: "How much of the free storage is used.",
        todo: "If it gets close to full, lower the days to keep files in File settings.",
        example: "The bar shows 80%, so old files should be cleaned soon.",
      },
    ],
  },
  {
    id: "requests",
    title: "Requests",
    action: "requests.view",
    items: [
      {
        name: "Request list",
        what: "All requests. You can search and filter by status, service and date.",
        todo: "Use the Status menu to see one group, for example only On hold.",
        example: "Search a client name or a tracking code to find one request.",
      },
      {
        name: "Open a request",
        what: "Shows the client, the files, the payment and the timeline. You can change the status and write a message to the client.",
        todo: "Change the status as the work moves forward. The client sees the status and your message on the tracking page, never the files.",
        example: "You write “We are preparing your documents” and set the status to In progress.",
      },
      {
        name: "Offline payment",
        what: "A payment made outside the website, such as cash or bank transfer.",
        todo: "Record the amount, the method and a receipt number or note. It is written to the activity log.",
        example: "A client pays cash at the office. You record ₱1,500 with receipt number 0042.",
      },
    ],
  },
  {
    id: "services",
    title: "Settings > Services and checklists",
    action: "services.view",
    items: [
      {
        name: "Service",
        what: "A service clients can order, with one description and a list of documents the client must send.",
        todo: "Add the service name and description. A new service starts hidden and with no fee until an admin or owner sets them.",
        example: "“Business permit renewal” with the checklist: old permit, valid ID, lease contract.",
      },
      {
        name: "Checklist",
        what: "The documents the client is asked to upload for this service.",
        todo: "Add one line for each document. Only add what you really need.",
        example: "“Valid government ID (front and back)”.",
      },
    ],
  },
  {
    id: "payments",
    title: "Settings > Payment methods",
    action: "payment_methods.manage",
    items: [
      {
        name: "Payment method",
        what: "A way the client can pay, such as GCash, with its QR code and account name.",
        todo: "Keep the account name and number correct. Use the checkboxes in the list to delete several at once.",
        example: "GCash with the business QR code and the account name.",
      },
    ],
  },
  {
    id: "site",
    title: "Settings > Site content",
    action: "site_content.edit",
    items: [
      {
        name: "Site content",
        what: "The words shown on the public website, such as contact details.",
        todo: "Save after each change. The public site shows the new words right away.",
        example: "Update the office phone number.",
      },
      {
        name: "Privacy notice and Terms",
        what: "The legal texts clients agree to. Every save makes a new version, and the old versions are kept in the history.",
        todo: "Only save when the text really changed, because clients agree to each version.",
        example: "You add a line about how long files are kept. This becomes version 2.",
      },
    ],
  },
  {
    id: "files",
    title: "Settings > File settings",
    action: "file_settings.edit",
    items: [
      {
        name: "Days to keep files",
        what: "How many days client files are kept after a request is Completed or Cancelled. A daily job then deletes them.",
        example: "30 means files are deleted 30 days after the request is completed.",
      },
      {
        name: "Files per request",
        what: "How many files a client can upload for one request.",
        example: "10 means a client can upload up to 10 files.",
      },
      {
        name: "File size",
        what: "The biggest size of one file, in megabytes.",
        example: "5 means a photo of 8 MB is not accepted.",
      },
    ],
  },
  {
    id: "accounts",
    title: "Settings > Admin users",
    action: "accounts.view",
    items: [
      {
        name: "Roles",
        what: "Staff work on requests and services. Admin and owner can also verify payments and change settings. Only an owner can manage other owners.",
        todo: "Give each person the lowest role that lets them do their work.",
        example: "A new employee is invited as Staff.",
      },
      {
        name: "Reset 2-step login",
        what: "Lets a person who lost their authenticator app set it up again.",
        todo: "Reset it only after you are sure the person is who they say they are.",
        example: "A staff member got a new phone and cannot sign in.",
      },
    ],
  },
  {
    id: "activity",
    title: "Activity",
    action: "activity.view",
    items: [
      {
        name: "Activity log",
        what: "A list of important changes: who did what, and when. It cannot be edited.",
        todo: "Check it when something looks wrong.",
        example: "Who changed the status of a request, or who opened a client file.",
      },
    ],
  },
  {
    id: "export",
    title: "Export",
    action: "export.csv",
    items: [
      {
        name: "Download payments",
        what: "A CSV file of payments for Excel or Google Sheets. It shows who has paid, which settles questions from clients.",
        todo: "Download it every week as a backup. Keep the file safe and delete it when not needed.",
        example: "A client says they already paid. You find the line in the file.",
      },
      {
        name: "Download requests",
        what: "A CSV file of all requests in the date range you choose.",
        todo: "Download it every week as a backup.",
        example: "You keep one file per month.",
      },
    ],
  },
  {
    id: "security",
    title: "Security",
    action: "security.self",
    items: [
      {
        name: "My authenticator devices",
        what: "The phones that make the sign-in codes for your account.",
        todo: "Keep two devices, so you can still sign in if you lose one.",
        example: "Your main phone and a tablet at home.",
      },
    ],
  },
];
