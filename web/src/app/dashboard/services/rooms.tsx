"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { api, type Place, type Resource, type Service } from "@/lib/api";

const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't work.");

/**
 * Rooms and equipment (slice 12). A service ticked here needs one of its rooms free for the whole
 * visit, at the location where the person works. The server picks a free one and the database
 * stops two visits sharing it.
 */
export function Rooms({ businessId, services }: { businessId: string; services: Service[] }) {
  const [rooms, setRooms] = useState<Resource[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const load = useCallback(() => api<Resource[]>(`/businesses/${businessId}/resources`), [businessId]);

  useEffect(() => {
    Promise.all([load(), api<Place[]>(`/businesses/${businessId}/locations`)])
      .then(([r, p]) => {
        setRooms(r);
        setPlaces(p);
      })
      .catch((e: unknown) => setError(message(e)));
  }, [businessId, load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setNameError("Enter a name, like Massage room or Laser.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const made = await api<Resource>(`/businesses/${businessId}/resources`, {
        method: "POST",
        body: { name, location_id: String(form.get("location") ?? places[0]?.id) },
      });
      setRooms((r) => [...(r ?? []), made]);
      setNotice(`Added ${made.name}. Tick the services that need it.`);
      formEl.reset();
    } catch (e) {
      setError(message(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <section aria-labelledby="rooms-title" className="rise flex flex-col gap-3">
      <div>
        <h2 id="rooms-title" className="text-xl font-bold">
          Rooms and equipment
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          For services that need a room or machine. When all of them are in use, that time can&apos;t be booked, even if
          someone on your team is free.
        </p>
      </div>
      <FormError message={error} />
      {notice && (
        <p
          role="status"
          className="rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm font-semibold text-spruce"
        >
          {notice}
        </p>
      )}
      {rooms === null && !error && <p className="text-muted">Loading…</p>}
      {rooms?.map((room) => (
        <Room
          key={room.id}
          room={room}
          place={places.length > 1 ? places.find((p) => p.id === room.location_id)?.name : undefined}
          services={services}
          onSaved={(saved) => {
            setRooms((r) => r?.map((x) => (x.id === saved.id ? saved : x)) ?? null);
            setNotice(`Saved ${saved.name}.`);
          }}
          onRemoved={() => {
            setRooms((r) => r?.filter((x) => x.id !== room.id) ?? null);
            setNotice(`Removed ${room.name}. Its bookings stay as they are.`);
          }}
        />
      ))}
      <form
        onSubmit={add}
        noValidate
        aria-label="Add a room or equipment"
        className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-4"
      >
        <Field
          label="New room or equipment"
          name="name"
          maxLength={80}
          placeholder="Massage room"
          className="min-w-48 flex-1"
          error={nameError ?? undefined}
          onInput={() => setNameError(null)}
        />
        {places.length > 1 && (
          <Select label="Location" name="location" className="min-w-40">
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        <Button type="submit" variant="secondary" loading={adding}>
          Add
        </Button>
      </form>
    </section>
  );
}

function Room({
  room,
  place,
  services,
  onSaved,
  onRemoved,
}: {
  room: Resource;
  place: string | undefined;
  services: Service[];
  onSaved: (room: Resource) => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `room-${room.id}`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api<Resource>(`/resources/${room.id}`, {
          method: "PATCH",
          body: { name: String(form.get("name") ?? "").trim(), service_ids: form.getAll("service").map(String) },
        }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/resources/${room.id}`, { method: "DELETE" });
      onRemoved();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <h3 id={titleId} className="font-bold">
        {room.name}
        {place && <span className="font-normal text-muted"> · {place}</span>}
      </h3>
      <FormError message={error} />
      <Field label="Name" name="name" defaultValue={room.name} maxLength={80} required />
      <fieldset>
        <legend className="text-sm font-semibold">Needed for</legend>
        {services.length === 0 ? (
          <p className="text-sm text-muted">Add a service first.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-x-4">
            {services.map((s) => (
              <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="service"
                  value={s.id}
                  defaultChecked={room.service_ids.includes(s.id)}
                  className="size-5 shrink-0 accent-spruce"
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy && !asking}>
          Save {room.name}
        </Button>
        {asking ? (
          <>
            <Button type="button" variant="danger" loading={busy} onClick={remove}>
              Yes, remove it
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}
