import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy notice" };

export default function Page() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-16">
      <h1 className="text-3xl font-bold">Privacy notice</h1>
      <p className="text-muted">
        This is a draft placeholder. The final text, reviewed for EU law, is published here before
        launch, and accounts are asked to accept it again.
      </p>
      <h2 className="mt-4 text-xl font-bold">Maps</h2>
      <p>
        Maps on Spruce show OpenStreetMap tiles. They load only when you open a map, and then your browser asks
        OpenStreetMap&apos;s servers for the tiles, which shares your IP address with them. Spruce never sends them
        your location.
      </p>
    </main>
  );
}
