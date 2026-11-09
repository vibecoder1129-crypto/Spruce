import type { MetadataRoute } from "next";

import { brand } from "@/brand";

/** Installable app (slice 11). Colours match the page background and the brand green. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: "Book beauty and wellness appointments, and run your venue's calendar.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F7F6F1",
    theme_color: "#F7F6F1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Your bookings", url: "/bookings" },
      { name: "Calendar", url: "/dashboard/calendar" },
    ],
  };
}
