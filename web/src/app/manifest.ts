import type { MetadataRoute } from "next";

import { brand } from "@/brand";

/** Installable app (slice 11). Colours match the page background and the brand green. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: "Book beauty and wellness appointments, and run your venue's calendar.",
    id: "/app",
    lang: "en",
    categories: ["lifestyle", "business"],
    // Sends each signed-in person to their own home: bookings, the dashboard or their day.
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#F7F6F1",
    theme_color: "#F7F6F1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Only shortcuts that suit customers and venues alike.
    shortcuts: [
      {
        name: "Find a venue",
        url: "/search",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
