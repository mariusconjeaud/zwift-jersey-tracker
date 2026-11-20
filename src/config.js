// Build-time settings. Set them as GitHub repository variables (see README)
// or in a local .env file for development.

// Base URL of the Cloudflare Worker, e.g. https://jersey-hunt-sync.<you>.workers.dev
// Leave empty to ship the app without cloud sync (progress stays on the device).
export const SYNC_API = (import.meta.env.VITE_SYNC_API || "").trim().replace(/\/+$/, "");

// Your World Bicycle Relief fundraising page. Falls back to WBR's homepage.
export const DONATE_URL = (import.meta.env.VITE_DONATE_URL || "").trim() || "https://worldbicyclerelief.org/";

// The donation nag shows once someone has ticked this many jerseys...
export const NAG_MIN_JERSEYS = 5;
// ...and comes back this many days after "Not now".
export const NAG_SNOOZE_DAYS = 30;
