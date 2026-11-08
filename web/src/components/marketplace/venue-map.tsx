"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";

export type Pin = { id: string; label: string; latitude: number; longitude: number; href?: string };

/**
 * An OpenStreetMap map with one pin per venue (feature list 7.2: Leaflet, no paid API).
 * Callers render it only after the visitor asks for a map, so no tile request leaves the
 * browser before that.
 */
export function VenueMap({ pins, label, className }: { pins: Pin[]; label: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<span class="venue-pin" aria-hidden="true"></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const points: [number, number][] = [];
      for (const pin of pins) {
        const point: [number, number] = [pin.latitude, pin.longitude];
        points.push(point);
        const marker = L.marker(point, { icon, title: pin.label, alt: pin.label, keyboard: true }).addTo(map);
        const popup = document.createElement("div");
        if (pin.href) {
          const link = document.createElement("a");
          link.href = pin.href;
          link.textContent = pin.label;
          popup.append(link);
        } else popup.textContent = pin.label;
        marker.bindPopup(popup);
      }
      if (points.length === 1) map.setView(points[0], 15);
      else if (points.length) map.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
      else map.setView([56.9496, 24.1052], 11);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins]);

  return <div ref={box} role="region" aria-label={label} className={className} />;
}
