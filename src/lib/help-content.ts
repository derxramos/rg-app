// The words on the admin Help page (/admin/help, also opened with the F1 key).
// Plain data, no server or browser code, so the page and the tests can both use it.
// The groups are in the same order as the left menu. To change a help text, edit it here.
// A test fails if a status has no entry or a group is not a real screen.

import { can, type Action, type Role } from "@/lib/permissions";
import { REQUEST_STATUSES, type RequestStatus } from "@/lib/status";

export type HelpItem = {
  name: string;
  // What it is.
  what: string;
  // What the person should do (optional).
  todo?: string;
  // A real-life example.
  example: string;
  // Set only for a request status: the page then shows the colored badge instead of plain text.
  status?: RequestStatus;
  // Shown only to roles that may do this action (src/lib/permissions.ts). Left out = the whole section's rule.
  action?: Action;
};

export type HelpSection = {
  // A sub-heading inside a group (for example one card of Settings). Left out = no sub-heading.
  title?: string;
  // Shown only to roles that may do this action.
  action: Action;
  items: HelpItem[];
};

export type HelpGroup = {
  id: string;
  title: string;
  sections: HelpSection[];
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

const STATUS_ITEMS: HelpItem[] = STATUS_ORDER.map((status) => ({
  ...STATUS_HELP[status],
  status,
}));

// Same order as the left menu: Dashboard, Requests, Settings, Activity, Export. Security is in the top bar.
export const HELP_GROUPS: HelpGroup[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    sections: [
      {
        action: "dashboard.view",
        items: [
          {
            name: "Status cards (top)",
            what: "Five cards count the open requests by status: Submitted, Under review, On hold, Payment submitted and In progress. Click a card to see only those requests.",
            todo: "Look at the numbers first thing in the morning. Each status is explained under Requests > Request statuses.",
            example: "The On hold card shows 3: three clients still need to reply.",
          },
          {
            name: "Needs action (left list)",
            what: "A short list of the requests that wait for you right now.",
            todo: "Open the first one and work down the list.",
            example: "A new request and a payment to check are both listed.",
          },
          {
            name: "File storage (right card)",
            what: "How much of the free storage is used.",
            todo: "If the bar gets close to full, lower the days to keep files in Settings > File settings.",
            example: "The bar shows 80%, so old files should be cleaned soon.",
          },
        ],
      },
    ],
  },
  {
    id: "requests",
    title: "Requests",
    sections: [
      {
        title: "The list",
        action: "requests.view",
        items: [
          {
            name: "Search bar",
            what: "Finds requests by the tracking code, the client's name or the client's email.",
            todo: "Type a few letters and press Search.",
            example: "Type “Santos” to find every request from a client with that name.",
          },
          {
            name: "Status menu",
            what: "Shows only the requests that have the status you pick.",
            todo: "Pick a status, for example On hold, to see who still needs to reply.",
            example: "Pick “Payment submitted” to see the payments waiting to be checked.",
          },
          {
            name: "Service and date filters",
            what: "Shows only one service, or only requests between two dates.",
            example: "Service “Business permit renewal”, from 1 to 15 of the month.",
          },
          {
            name: "Opening a request",
            what: "Click a row to see the client, files, payment and timeline. After you go back, the list keeps your search and filters.",
            example:
              "You open a request, read it, and press Back to Requests. The same list is still there.",
          },
        ],
      },
      {
        title: "One request",
        action: "requests.view",
        items: [
          {
            name: "Change the status",
            what: "Moves the request to the next step. Only the steps that make sense are offered.",
            todo: "Change it as the work moves forward. The client sees the status on the tracking page.",
            example: "After checking the documents, you set Under review.",
            action: "requests.change_status",
          },
          {
            name: "Message to the client",
            what: "A short text the client sees on the tracking page next to the status. Files are never shown there.",
            todo: "Say clearly what you need, in simple words.",
            example: "“Please send a clear photo of your valid ID.”",
            action: "requests.change_status",
          },
          {
            name: "Client files",
            what: "The documents the client sent. Every time a file is opened, it is written to the activity log.",
            todo: "Open a file only when you need it.",
            example: "You open the lease contract to check the address.",
            action: "requests.open_file",
          },
          {
            name: "Verify or reject a payment",
            what: "Confirms that the money arrived, or says the payment is wrong. Only the owner and admin can do this.",
            todo: "Compare the amount and reference number with your payment app first.",
            example: "The receipt says ₱1,500 and your GCash shows ₱1,500, so you verify it.",
            action: "payments.verify",
          },
          {
            name: "Record a payment (cash or other)",
            what: "A payment made outside the website, such as cash or bank transfer.",
            todo: "Enter the amount, the method and a receipt number or note. It is written to the activity log.",
            example:
              "A client pays cash at the office. You record ₱1,500 with receipt number 0042.",
            action: "payments.record_offline",
          },
        ],
      },
      {
        title: "Request statuses",
        action: "requests.view",
        items: STATUS_ITEMS,
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    sections: [
      {
        title: "Admin users",
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
        title: "Payment methods",
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
        title: "Services and checklists",
        action: "services.view",
        items: [
          {
            name: "Service",
            what: "A service clients can order, with one description and a list of documents the client must send.",
            todo: "Add the service name and description. A new service starts hidden and with no fee until an admin or owner sets them.",
            example: "“Business permit renewal”.",
          },
          {
            name: "Checklist",
            what: "The documents the client is asked to upload for a service.",
            todo: "Add one line for each document. Only add what you really need.",
            example: "“Valid government ID (front and back)”.",
          },
        ],
      },
      {
        title: "Site content",
        action: "site_content.edit",
        items: [
          {
            name: "Contact details and home page text",
            what: "The words shown on the public website: phone, email, address, hours, Messenger and Viber links, and the home page text.",
            todo: "Save after each change. An empty link hides its button.",
            example: "Update the office phone number.",
          },
        ],
      },
      {
        title: "Privacy notice and Terms",
        action: "legal_text.edit",
        items: [
          {
            name: "Privacy notice and Terms of service",
            what: "The legal texts clients agree to. Every save makes a new version, and the old versions are kept in the history.",
            todo: "Only save when the text really changed, because clients agree to each version.",
            example: "You add a line about how long files are kept. This becomes version 2.",
          },
        ],
      },
      {
        title: "File settings",
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
    ],
  },
  {
    id: "activity",
    title: "Activity",
    sections: [
      {
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
    ],
  },
  {
    id: "export",
    title: "Export",
    sections: [
      {
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
    ],
  },
  {
    id: "security",
    title: "Security (top bar)",
    sections: [
      {
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
    ],
  },
];

// What one role may read: sections and items it may use. A group with nothing left is dropped.
export function helpGroupsFor(role: Role): HelpGroup[] {
  return HELP_GROUPS.map((group) => ({
    ...group,
    sections: group.sections
      .filter((s) => can(role, s.action))
      .map((s) => ({ ...s, items: s.items.filter((i) => !i.action || can(role, i.action)) }))
      .filter((s) => s.items.length > 0),
  })).filter((group) => group.sections.length > 0);
}

// Which help group belongs to the page the person is on (used by F1 to open the right group first).
export function helpTopicForPath(pathname: string): string | null {
  if (pathname === "/admin") return "dashboard";
  const map: [string, string][] = [
    ["/admin/requests", "requests"],
    ["/admin/settings", "settings"],
    ["/admin/activity", "activity"],
    ["/admin/export", "export"],
    ["/admin/security", "security"],
  ];
  for (const [prefix, id] of map) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return id;
  }
  return null;
}
