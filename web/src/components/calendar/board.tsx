"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  addDays,
  api,
  ApiError,
  clock,
  dayAt,
  formatDuration,
  formatPrice,
  isoDate,
  minutesAt,
  parseDate,
  toMinutes,
  type Booking,
  type BookingDetail,
  type DayBoard as Board,
  type PaymentMethod,
  type TimeOff,
  type VisitForm,
  type Waiting,
  type WeekBoard,
} from "@/lib/api";
import { cn } from "@/lib/cn";

import { initials, staffColors, type StaffColor } from "./colors";
import { useFieldErrors } from "@/lib/form-errors";

// HLD 4.5: a staff day board in 15-minute slots. Forms offer 08:00 to 20:00; the board itself
// shows only the hours someone works or is booked that day.
const OPEN = 8 * 60;
const CLOSE = 20 * 60;
const STEP = 15;
const ROWS = (CLOSE - OPEN) / STEP;
const ROW = 30;
const QUARTERS = Array.from({ length: ROWS + 1 }, (_, i) => clock(OPEN + i * STEP));
const LIVE = new Set(["pending", "confirmed", "completed"]);
const POLL_MS = 30_000; // new online bookings appear without a refresh

type View = "board" | "week" | "list";
type Pick =
  | { kind: "booking"; id: string }
  | { kind: "time-off"; block: TimeOff }
  | { kind: "new"; staffId: string; time: string }
  | { kind: "block"; staffId: string; time: string };
type Slot = { staffId: string; minutes: number; top: number };

function message(e: unknown): string {
  return e instanceof Error ? e.message : "That didn't work.";
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(parseDate(iso));
}

/**
 * The day board for owners and staff. The API decides which columns the caller sees and what
 * they may do (`can_book_staff_ids`, `can_block_time`); this only hides what it would refuse.
 */
export function DayBoard({ businessId }: { businessId: string }) {
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [locationId, setLocationId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [view, setView] = useState<View>("board");
  const [hidden, setHidden] = useState<string[]>([]);
  const [person, setPerson] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Waiting[]>([]);

  const fetchBoard = useCallback(() => {
    const query = new URLSearchParams({ date });
    if (locationId) query.set("location_id", locationId);
    return api<Board>(`/businesses/${businessId}/calendar?${query}`);
  }, [businessId, date, locationId]);
  const load = async () => setBoard(await fetchBoard());
  const [refreshed, setRefreshed] = useState(0);
  const shownBoard = useRef<Board | null>(null);
  useEffect(() => {
    shownBoard.current = board;
  }, [board]);

  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch((e: unknown) => setError(message(e)));
  }, [fetchBoard]);

  // Who is waiting for a time that day. Refreshed with the board; staff without the calendar get none.
  useEffect(() => {
    api<Waiting[]>(`/businesses/${businessId}/waitlist?date=${date}`)
      .then(setWaiting)
      .catch(() => setWaiting([]));
  }, [businessId, date, refreshed]);

  // Live updates: refetch while the tab is visible, and say when an online booking arrives.
  useEffect(() => {
    let live = true;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await fetchBoard();
        if (!live) return;
        const prev = shownBoard.current;
        if (prev && prev.date === next.date && prev.location_id === next.location_id) {
          const seen = new Set(prev.bookings.map((b) => b.id));
          const fresh = next.bookings.filter((b) => !seen.has(b.id) && b.source === "consumer");
          if (fresh.length === 1) {
            const b = fresh[0];
            setNotice(`New online booking: ${clock(minutesAt(b.starts_at, next.timezone))} ${b.client_name}.`);
          } else if (fresh.length > 1) {
            setNotice(`${fresh.length} new online bookings.`);
          }
        }
        setBoard(next);
        setRefreshed((n) => n + 1);
      } catch {
        // A missed refresh is retried on the next tick.
      }
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [fetchBoard]);

  /** Drag and drop on the board. The API re-checks the shift, blocked time and overlaps. */
  async function move(id: string, staffId: string, minutes: number) {
    const booking = board?.bookings.find((b) => b.id === id);
    if (!booking || !board) return;
    const time = clock(minutes);
    if (staffId === booking.staff_id && time === clock(minutesAt(booking.starts_at, board.timezone))) return;
    setError(null);
    setNotice(null);
    try {
      await api(`/bookings/${id}`, { method: "PATCH", body: { start: `${board.date}T${time}`, staff_id: staffId } });
      const person = board.staff.find((s) => s.id === staffId)?.display_name ?? "";
      await changed(`Moved ${booking.client_name} to ${time} with ${person}.`);
    } catch (e) {
      setError(message(e));
    }
  }

  function openDay(day: string, bookingId?: string) {
    setDate(day);
    setView("board");
    setPick(bookingId ? { kind: "booking", id: bookingId } : null);
  }

  async function changed(text: string) {
    setPick(null);
    setNotice(text);
    await load();
  }

  const tz = board?.timezone ?? "UTC";
  const columns = board?.staff.filter((s) => !hidden.includes(s.id)) ?? [];
  const colors = staffColors(board?.staff ?? []);
  const needle = search.trim().toLowerCase();
  const matches = (b: Booking) =>
    !needle || b.client_name.toLowerCase().includes(needle) || b.service_name.toLowerCase().includes(needle);
  const shown = board?.bookings.filter((b) => matches(b) && columns.some((c) => c.id === b.staff_id)) ?? [];
  const canBook = (board?.can_book_staff_ids.length ?? 0) > 0;
  const weekOf = person ?? columns[0]?.id ?? board?.staff[0]?.id ?? null;
  const monday = addDays(date, -((parseDate(date).getDay() + 6) % 7));
  const span = view === "week" ? 7 : 1;
  const firstBookable = board?.can_book_staff_ids[0] ?? "";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="mt-1 text-lg font-semibold text-spruce">
            {view === "week" ? `Week of ${longDate(monday)}` : longDate(date)}
          </p>
        </div>
        {board && board.locations.length > 1 && (
          <Chips
            label="Location"
            items={board.locations.map((l) => ({ id: l.id, name: l.name }))}
            isOn={(id) => id === board.location_id}
            onPick={(id) => {
              setHidden([]);
              setPerson(null);
              setPick(null);
              setLocationId(id);
            }}
            icon="pin"
            compact
          />
        )}
        <div className="flex flex-wrap gap-2">
          {board?.can_block_time && (
            <Button
              variant="secondary"
              onClick={() =>
                setPick({ kind: "block", staffId: columns[0]?.id ?? board.staff[0]?.id ?? "", time: "12:00" })
              }
            >
              Block time
            </Button>
          )}
          {canBook && (
            <Button onClick={() => setPick({ kind: "new", staffId: firstBookable, time: "10:00" })}>
              <Icon name="calendar" /> New appointment
            </Button>
          )}
        </div>
      </div>

      <div
        role="toolbar"
        aria-label="Calendar controls"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-[var(--shadow-card)]"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <IconButton
              label={view === "week" ? "Previous week" : "Previous day"}
              onClick={() => setDate((d) => addDays(d, -span))}
              flip
            />
            <Button variant="ghost" onClick={() => setDate(isoDate(new Date()))}>
              Today
            </Button>
            <IconButton
              label={view === "week" ? "Next week" : "Next day"}
              onClick={() => setDate((d) => addDays(d, span))}
            />
          </div>
          <WeekStrip monday={monday} date={date} week={view === "week"} onPick={setDate} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Toggle label="View" value={view} onChange={setView} options={{ board: "Day", week: "Week", list: "List" }} />
          <Field
            label="Date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-44"
          />
          <Field
            label="Search"
            type="search"
            value={search}
            placeholder="Client or service"
            onChange={(e) => setSearch(e.target.value)}
            className="w-52"
          />
        </div>
        {board && board.staff.length > 1 && (
          <Chips
            label={view === "week" ? "Whose week" : "Team"}
            items={board.staff.map((s) => ({ id: s.id, name: s.display_name, color: colors.get(s.id) }))}
            isOn={(id) => (view === "week" ? id === weekOf : !hidden.includes(id))}
            onPick={(id) => {
              if (view === "week") return setPerson(id);
              // Hiding the last person shown would leave an empty board, so show everyone instead.
              const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
              setHidden(next.length >= board.staff.length ? [] : next);
            }}
            all={
              view === "week"
                ? undefined
                : { on: hidden.length === 0, onPick: () => setHidden([]), count: board.staff.length }
            }
          />
        )}
      </div>

      <FormError message={error} />
      {board && columns.length > 0 && view !== "week" && <Summary board={board} columns={columns} bookings={shown} />}
      {view !== "week" && waiting.length > 0 && <WaitingList waiting={waiting} />}
      {notice && (
        <p
          role="status"
          className="pop rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm font-semibold text-spruce"
        >
          {notice}
        </p>
      )}

      <div className={cn("grid items-start gap-6", pick && "lg:grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="min-w-0">
          {!board && !error && <p className="text-muted">Loading…</p>}
          {board && columns.length === 0 && (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8 text-muted">
              No one works at this location yet. Add your team first.
            </p>
          )}
          {board && columns.length > 0 && view === "board" && (
            <Grid
              board={board}
              columns={columns}
              bookings={shown}
              today={date === isoDate(new Date())}
              slot={slot}
              onSlot={setSlot}
              onPick={(p) => {
                setSlot(null);
                setNotice(null);
                setPick(p);
              }}
              onMove={move}
              colors={colors}
            />
          )}
          {board && view === "week" && weekOf && (
            <WeekView
              businessId={businessId}
              staffId={weekOf}
              date={date}
              refreshed={refreshed}
              search={needle}
              onOpenDay={openDay}
              color={weekOf ? colors.get(weekOf) : undefined}
            />
          )}
          {board && columns.length > 0 && view === "list" && (
            <List board={board} bookings={shown} colors={colors} onPick={(id) => setPick({ kind: "booking", id })} />
          )}
        </div>
        {pick && board && (
          <aside className="slide-in rounded-[var(--radius-card)] border border-line bg-surface p-6 lg:sticky lg:top-6">
            {pick.kind === "booking" && (
              <AppointmentPanel
                key={pick.id}
                id={pick.id}
                board={board}
                onClose={() => setPick(null)}
                onChanged={changed}
              />
            )}
            {pick.kind === "new" && (
              <WalkInForm
                key={`${pick.staffId}-${pick.time}`}
                businessId={businessId}
                board={board}
                staffId={pick.staffId}
                time={pick.time}
                onClose={() => setPick(null)}
                onSaved={changed}
              />
            )}
            {pick.kind === "block" && (
              <BlockForm
                key={`${pick.staffId}-${pick.time}`}
                board={board}
                staffId={pick.staffId}
                time={pick.time}
                onClose={() => setPick(null)}
                onSaved={changed}
              />
            )}
            {pick.kind === "time-off" && (
              <TimeOffPanel block={pick.block} board={board} tz={tz} onClose={() => setPick(null)} onSaved={changed} />
            )}
          </aside>
        )}
      </div>
    </>
  );
}

function IconButton({ label, onClick, flip }: { label: string; onClick: () => void; flip?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-[var(--radius-control)] text-ink hover:bg-mint"
    >
      <Icon name="chevron" className={cn(flip && "rotate-180")} />
    </button>
  );
}

/** A row of on/off buttons: locations, or which team members to show. */
function Chips({
  label,
  items,
  isOn,
  onPick,
  all,
  icon,
  compact,
}: {
  compact?: boolean;
  label: string;
  items: { id: string; name: string; color?: StaffColor }[];
  isOn: (id: string) => boolean;
  onPick: (id: string) => void;
  all?: { on: boolean; onPick: () => void; count: number };
  icon?: "pin";
}) {
  const chip =
    "flex min-h-11 shrink-0 items-center whitespace-nowrap gap-2 rounded-full border px-3 text-sm font-semibold transition-colors";
  return (
    <div role="group" aria-label={label} className={cn("flex min-w-0 gap-2", compact ? "items-center" : "flex-col")}>
      <span aria-hidden="true" className={cn("text-sm font-semibold", compact ? "text-muted" : "text-ink")}>
        {label}
      </span>
      {/* One row that scrolls sideways, so 15 people don't push the board off the screen. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {all && (
          <button
            type="button"
            aria-pressed={all.on}
            onClick={all.onPick}
            className={cn(
              chip,
              all.on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:bg-mint",
            )}
          >
            Everyone ({all.count})
          </button>
        )}
        {items.map((item) => {
          const on = isOn(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(item.id)}
              className={cn(
                chip,
                on && !item.color && "border-ink bg-ink text-white",
                on && item.color && "text-ink",
                !on && "border-line-strong bg-surface hover:bg-mint",
                !on && item.color && "bg-ground text-muted line-through",
              )}
              style={on && item.color ? { borderColor: item.color.accent, background: item.color.tint } : undefined}
            >
              {icon && <Icon name={icon} />}
              {item.color && (
                <span
                  aria-hidden="true"
                  className="flex size-6 items-center justify-center rounded-full text-[0.625rem] font-bold text-white"
                  style={{ background: on ? item.color.accent : "var(--color-muted)" }}
                >
                  {initials(item.name)}
                </span>
              )}
              {item.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Monday to Sunday around the chosen day, one tap to jump. */
function WeekStrip({
  monday,
  date,
  week,
  onPick,
}: {
  monday: string;
  date: string;
  week: boolean;
  onPick: (day: string) => void;
}) {
  const today = isoDate(new Date());
  const short = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" });
  return (
    <div
      role="group"
      aria-label="Days this week"
      className="flex min-w-0 basis-full gap-1 overflow-x-auto sm:flex-1 sm:basis-0"
    >
      {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => {
        const on = week || day === date;
        return (
          <button
            key={day}
            type="button"
            aria-pressed={day === date}
            onClick={() => onPick(day)}
            className={cn(
              "relative flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center rounded-[var(--radius-control)] text-sm transition-colors",
              day === date ? "bg-spruce text-white" : on ? "bg-mint text-ink" : "text-ink hover:bg-mint",
            )}
          >
            <span className="text-xs font-semibold uppercase">{short.format(parseDate(day))}</span>{" "}
            <span className="text-lg leading-tight font-bold tabular-nums">{parseDate(day).getDate()}</span>
            <span className="sr-only"> {month.format(parseDate(day))}</span>
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", day === today ? (day === date ? "bg-white" : "bg-spruce") : "")}
            />
          </button>
        );
      })}
    </div>
  );
}

function Toggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Record<T, string>;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex rounded-[var(--radius-control)] border border-line-strong p-0.5">
        {(Object.keys(options) as T[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={cn(
              "min-h-11 rounded-[12px] px-3 text-sm font-semibold transition-colors",
              value === key ? "bg-ink text-white" : "text-ink hover:bg-mint",
            )}
          >
            {options[key]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// --- the board -------------------------------------------------------------------------------

type Kind = "online" | "walk-in" | "pending" | "done" | "no-show";

/** Status is a word and a mark on the block; colour belongs to the team member. */
const KIND: Record<Kind, { label: string; mark: string }> = {
  online: { label: "Booked online", mark: "●" },
  "walk-in": { label: "Added by the venue", mark: "○" },
  pending: { label: "Waiting to confirm", mark: "…" },
  done: { label: "Done", mark: "✓" },
  "no-show": { label: "No-show", mark: "✕" },
};

/** A block's colours: the person's tint while it's still to come, plain once it's over. */
function blockStyle(kind: Kind, color: StaffColor | undefined): CSSProperties {
  const accent = color?.accent ?? "var(--color-spruce)";
  if (kind === "done" || kind === "no-show") return { borderColor: accent, background: "var(--color-surface)" };
  return { borderColor: accent, background: color?.tint ?? "var(--color-mint-strong)" };
}

function kindOf(b: Booking): Kind {
  if (b.status === "completed") return "done";
  if (b.status === "no_show") return "no-show";
  if (b.status === "pending") return "pending";
  return b.source === "consumer" ? "online" : "walk-in";
}

/** The hours worth showing: from the earliest shift or booking to the latest, on whole hours. */
function dayHours(board: Board, columns: Board["staff"], bookings: Booking[]): { open: number; close: number } {
  const tz = board.timezone;
  const starts: number[] = [];
  const ends: number[] = [];
  for (const c of columns) {
    if (c.shift) {
      starts.push(toMinutes(c.shift.starts));
      ends.push(toMinutes(c.shift.ends));
    }
  }
  for (const b of bookings) {
    starts.push(minutesAt(b.starts_at, tz));
    ends.push(dayAt(b.ends_at, tz) > board.date ? 24 * 60 : minutesAt(b.ends_at, tz));
  }
  if (starts.length === 0) return { open: 9 * 60, close: 17 * 60 };
  const open = Math.floor(Math.min(...starts) / 60) * 60;
  const close = Math.min(24 * 60, Math.ceil(Math.max(...ends) / 60) * 60);
  return { open, close: Math.max(close, open + 60) };
}

/** The day at a glance for the people shown: what's booked, what's free, what it should bring in. */
function WaitingList({ waiting }: { waiting: Waiting[] }) {
  return (
    <section
      aria-labelledby="waiting"
      className="rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3"
    >
      <h2 id="waiting" className="text-sm font-semibold">
        Waiting for a time ({waiting.length})
      </h2>
      <p className="text-sm text-muted">If you cancel or move an appointment, they&apos;re emailed straight away.</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {waiting.map((w) => (
          <li key={w.id} className="rounded-full bg-ground px-3 py-1.5 text-sm">
            <span className="font-semibold">{w.name}</span> · {w.service_name}
            {w.notified && <span className="text-muted"> · emailed</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Summary({ board, columns, bookings }: { board: Board; columns: Board["staff"]; bookings: Booking[] }) {
  const tz = board.timezone;
  const live = bookings.filter((b) => LIVE.has(b.status));
  const length = (b: { starts_at: string; ends_at: string }) =>
    (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000;
  const booked = live.reduce((sum, b) => sum + length(b), 0);
  const ids = new Set(columns.map((c) => c.id));
  const working = columns.reduce(
    (sum, c) => sum + (c.shift ? toMinutes(c.shift.ends) - toMinutes(c.shift.starts) : 0),
    0,
  );
  const blocked = board.time_off
    .filter((t) => ids.has(t.staff_id))
    .reduce((sum, t) => {
      const from = dayAt(t.starts_at, tz) < board.date ? 0 : minutesAt(t.starts_at, tz);
      const to = dayAt(t.ends_at, tz) > board.date ? 24 * 60 : minutesAt(t.ends_at, tz);
      return sum + Math.max(0, to - from);
    }, 0);
  const free = Math.max(0, working - booked - blocked);
  const currency = live[0]?.currency ?? board.services[0]?.currency ?? "EUR";
  const takings = live.reduce((sum, b) => sum + b.price_minor, 0);
  const noShows = bookings.filter((b) => b.status === "no_show").length;
  const items = [
    { label: "Appointments", value: String(live.length) },
    { label: "Booked", value: booked ? formatDuration(booked) : "0 min" },
    { label: "Free time", value: working === 0 ? "No one working" : free ? formatDuration(free) : "Fully booked" },
    { label: "Expected takings", value: formatPrice(takings, currency) },
  ];
  if (noShows) items.push({ label: "No-shows", value: String(noShows) });
  return (
    <section
      aria-label="Day summary"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[var(--radius-control)] bg-mint px-4 py-2.5"
    >
      <dl className="flex flex-wrap gap-x-5 gap-y-1">
        {items.map((i) => (
          // The value reads first on screen; the term still comes first for screen readers.
          <div key={i.label} className="flex flex-row-reverse items-baseline gap-1.5">
            <dt className="text-sm text-muted">{i.label.toLowerCase()}</dt>
            <dd className="text-lg font-bold text-spruce tabular-nums">{i.value}</dd>
          </div>
        ))}
      </dl>
      <ul aria-label="Colour key" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <li>Colour = team member.</li>
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="font-bold text-ink">
              {KIND[k].mark}
            </span>
            {KIND[k].label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Grid({
  board,
  columns,
  bookings,
  today,
  slot,
  onSlot,
  onPick,
  onMove,
  colors,
}: {
  colors: Map<string, StaffColor>;
  board: Board;
  columns: Board["staff"];
  bookings: Booking[];
  today: boolean;
  slot: Slot | null;
  onSlot: (s: Slot | null) => void;
  onPick: (p: Pick) => void;
  onMove: (id: string, staffId: string, minutes: number) => void;
}) {
  const row = ROW;
  const tz = board.timezone;
  const { open: OPEN, close: CLOSE } = dayHours(board, columns, bookings);
  const height = ((CLOSE - OPEN) / STEP) * row;
  const top = (minutes: number) => ((Math.max(OPEN, Math.min(CLOSE, minutes)) - OPEN) / STEP) * row;
  const [now, setNow] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Open at the current time today, otherwise at the first appointment.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = bookings.length ? Math.min(...bookings.map((b) => minutesAt(b.starts_at, tz))) : OPEN;
    const at = today ? minutesAt(new Date().toISOString(), tz) - 60 : first - 30;
    el.scrollTop = Math.max(0, top(at));
    // Only when the day or location changes, not on every booking edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.date, board.location_id]);

  useEffect(() => {
    if (!today) return;
    const tick = () => setNow(minutesAt(new Date().toISOString(), tz));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [today, tz]);

  function clickSlot(event: MouseEvent<HTMLDivElement>, staffId: string) {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const minutes = OPEN + Math.floor(y / row) * STEP;
    if (minutes >= CLOSE) return;
    onSlot({ staffId, minutes, top: top(minutes) });
  }

  const canBook = (id: string) => board.can_book_staff_ids.includes(id);
  const grab = useRef(0); // where on the block it was picked up, so it lands where it's dropped

  function drop(event: DragEvent<HTMLDivElement>, staffId: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/x-booking");
    if (!id) return;
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top - grab.current;
    const minutes = OPEN + Math.max(0, Math.round(y / row)) * STEP;
    onMove(id, staffId, minutes);
  }

  return (
    <div
      ref={scroller}
      tabIndex={0}
      role="region"
      aria-label="Day board"
      className="max-h-[calc(100dvh-13rem)] min-h-96 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface"
    >
      <div className="flex w-max min-w-full">
        <div aria-hidden="true" className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-surface">
          <div className="sticky top-0 z-30 h-16 border-b border-line bg-surface" />
          <div className="relative" style={{ height }}>
            {Array.from({ length: (CLOSE - OPEN) / 60 }, (_, i) => (
              <span
                key={i}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted"
                style={{ top: i * 4 * row }}
              >
                {i === 0 ? "" : clock(OPEN + i * 60)}
              </span>
            ))}
          </div>
        </div>
        {columns.map((col) => {
          const shiftStart = col.shift ? toMinutes(col.shift.starts) : null;
          const shiftEnd = col.shift ? toMinutes(col.shift.ends) : null;
          const own = bookings.filter((b) => b.staff_id === col.id);
          const blocks = board.time_off.filter((b) => b.staff_id === col.id);
          const clickable = canBook(col.id) || board.can_block_time;
          return (
            <section
              key={col.id}
              aria-label={col.display_name}
              className={cn(
                "flex-1 border-r border-line last:border-r-0",
                columns.length > 6 ? "min-w-36" : "min-w-44",
              )}
            >
              <header
                className="sticky top-0 z-10 flex h-16 items-center gap-2.5 border-t-4 border-b border-b-line bg-surface px-3"
                style={{ borderTopColor: colors.get(col.id)?.accent }}
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: colors.get(col.id)?.accent }}
                >
                  {initials(col.display_name)}
                </span>
                <span className="min-w-0">
                  <h2 className="truncate text-sm font-bold">{col.display_name}</h2>
                  <p className="text-xs text-muted">
                    {col.shift ? `${col.shift.starts}–${col.shift.ends}` : "Day off"}
                    {own.length > 0 && ` · ${own.filter((b) => LIVE.has(b.status)).length} booked`}
                  </p>
                </span>
              </header>
              <div
                data-opens={OPEN}
                className={cn("relative bg-ground", clickable && "cursor-pointer")}
                style={{
                  height,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${row * 4 - 1}px, var(--color-line) ${row * 4 - 1}px ${row * 4}px)`,
                }}
                // Mouse shortcut only. Keyboard users have the New appointment and Block time buttons.
                onClick={clickable ? (e) => clickSlot(e, col.id) : undefined}
                onDragOver={canBook(col.id) ? (e) => e.preventDefault() : undefined}
                onDrop={canBook(col.id) ? (e) => drop(e, col.id) : undefined}
              >
                {shiftStart !== null && shiftEnd !== null && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bg-surface"
                    style={{
                      top: top(shiftStart),
                      height: top(shiftEnd) - top(shiftStart),
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${row * 4 - 1}px, var(--color-line) ${row * 4 - 1}px ${row * 4}px)`,
                    }}
                  />
                )}
                {blocks.map((b) => {
                  const from = dayAt(b.starts_at, tz) < board.date ? OPEN : Math.max(OPEN, minutesAt(b.starts_at, tz));
                  const end = dayAt(b.ends_at, tz) > board.date ? CLOSE : minutesAt(b.ends_at, tz);
                  if (end <= OPEN || from >= CLOSE) return null;
                  const label = `${b.reason || "Blocked"}, ${clock(from)} to ${clock(end)}`;
                  const style = { top: top(from), height: Math.max(row, top(end) - top(from)) };
                  const cls =
                    "absolute inset-x-1 overflow-hidden rounded-lg border border-line-strong px-2 py-1 text-left text-xs font-semibold text-muted " +
                    "bg-[repeating-linear-gradient(135deg,var(--color-mint)_0_6px,var(--color-surface)_6px_12px)]";
                  return board.can_block_time ? (
                    <button
                      key={b.id}
                      type="button"
                      className={cn(cls, "hover:border-spruce")}
                      style={style}
                      aria-label={label}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick({ kind: "time-off", block: b });
                      }}
                    >
                      {b.reason || "Blocked"}
                    </button>
                  ) : (
                    <div key={b.id} className={cls} style={style} aria-label={label} role="note">
                      {b.reason || "Blocked"}
                    </div>
                  );
                })}
                {own.map((b) => {
                  const start = minutesAt(b.starts_at, tz);
                  const end = minutesAt(b.ends_at, tz) || 24 * 60;
                  if (end <= OPEN || start >= CLOSE) return null;
                  const h = Math.max(row, top(end) - top(start));
                  const kind = kindOf(b);
                  const movable = (b.status === "pending" || b.status === "confirmed") && canBook(b.staff_id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      // Mouse shortcut only. Everyone can move it with "Edit or move" in the panel.
                      draggable={movable}
                      onDragStart={(e) => {
                        grab.current = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        e.dataTransfer.setData("text/x-booking", b.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick({ kind: "booking", id: b.id });
                      }}
                      className={cn(
                        "absolute inset-x-1 z-[1] flex flex-col justify-start overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs text-ink shadow-sm transition-transform hover:-translate-y-px hover:shadow-md",
                        kind === "pending" && "border-y border-r border-dashed",
                        (kind === "done" || kind === "no-show") &&
                          "border-y border-r border-y-line border-r-line text-muted",
                      )}
                      style={{ top: top(start), height: h - 2, ...blockStyle(kind, colors.get(b.staff_id)) }}
                    >
                      <span className="flex items-baseline gap-1 font-bold">
                        <span aria-hidden="true">{KIND[kind].mark}</span>
                        <span className={cn("truncate", kind === "no-show" && "line-through")}>
                          {clock(start)} {b.client_name}
                        </span>
                      </span>{" "}
                      <span className={h > row * 1.5 ? "block truncate text-ink" : "sr-only"}>
                        {b.service_name} · {KIND[kind].label}
                      </span>
                      {b.client_flags.length > 0 && h > row * 2.5 && <Flags flags={b.client_flags} className="mt-1" />}
                      {b.client_flags.includes("risk") && h <= row * 2.5 && (
                        <span className="block font-bold text-danger">{FLAG_TEXT.risk}</span>
                      )}
                      <span className="sr-only">(until {clock(end)})</span>
                    </button>
                  );
                })}
                {now !== null && now >= OPEN && now < CLOSE && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 z-[2] h-0.5 bg-danger"
                    style={{ top: top(now) }}
                  />
                )}
                {slot?.staffId === col.id && (
                  <SlotMenu
                    slot={slot}
                    canBook={canBook(col.id)}
                    canBlock={board.can_block_time}
                    onClose={() => onSlot(null)}
                    onPick={onPick}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SlotMenu({
  slot,
  canBook,
  canBlock,
  onClose,
  onPick,
}: {
  slot: Slot;
  canBook: boolean;
  canBlock: boolean;
  onClose: () => void;
  onPick: (p: Pick) => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const time = clock(slot.minutes);
  return (
    <div
      role="group"
      aria-label={`At ${time}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="pop absolute inset-x-1 z-30 flex flex-col gap-1 rounded-xl border border-line-strong bg-surface p-1.5 shadow-lg"
      style={{ top: slot.top }}
    >
      {canBook && (
        <button
          ref={first}
          type="button"
          className="min-h-11 rounded-lg px-2 text-left text-sm font-semibold hover:bg-mint"
          onClick={() => onPick({ kind: "new", staffId: slot.staffId, time })}
        >
          Add appointment at {time}
        </button>
      )}
      {canBlock && (
        <button
          ref={canBook ? undefined : first}
          type="button"
          className="min-h-11 rounded-lg px-2 text-left text-sm font-semibold hover:bg-mint"
          onClick={() => onPick({ kind: "block", staffId: slot.staffId, time })}
        >
          Block time
        </button>
      )}
      <button
        type="button"
        className="min-h-11 rounded-lg px-2 text-left text-sm text-muted hover:bg-mint"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

/** One person's week. Each day opens on the day board; appointments open there too. */
function WeekView({
  businessId,
  staffId,
  date,
  refreshed,
  search,
  onOpenDay,
  color,
}: {
  color: StaffColor | undefined;
  businessId: string;
  staffId: string;
  date: string;
  refreshed: number;
  search: string;
  onOpenDay: (day: string, bookingId?: string) => void;
}) {
  const monday = addDays(date, -((parseDate(date).getDay() + 6) % 7));
  const [week, setWeek] = useState<WeekBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<WeekBoard>(`/businesses/${businessId}/calendar/week?staff_id=${staffId}&week=${monday}`)
      .then((w) => live && (setWeek(w), setError(null)))
      .catch((e: unknown) => live && setError(message(e)));
    return () => {
      live = false;
    };
  }, [businessId, staffId, monday, refreshed]);

  if (error) return <FormError message={error} />;
  if (!week || week.week !== monday || week.staff.id !== staffId) return <p className="text-muted">Loading…</p>;
  const tz = week.timezone;
  const today = isoDate(new Date());
  const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <section aria-label={`${week.staff.display_name}'s week`} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2.5 text-xl font-bold">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: color?.accent }}
        >
          {initials(week.staff.display_name)}
        </span>
        {week.staff.display_name}&apos;s week
      </h2>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {week.days.map((d) => {
          const own = week.bookings.filter(
            (b) =>
              dayAt(b.starts_at, tz) === d.date &&
              (!search ||
                b.client_name.toLowerCase().includes(search) ||
                b.service_name.toLowerCase().includes(search)),
          );
          const live = own.filter((b) => LIVE.has(b.status));
          const booked = live.reduce((sum, b) => sum + minutesAt(b.ends_at, tz) - minutesAt(b.starts_at, tz), 0);
          const blocked = week.time_off
            .filter((t) => dayAt(t.starts_at, tz) <= d.date && dayAt(t.ends_at, tz) >= d.date)
            .reduce((sum, t) => {
              const from = dayAt(t.starts_at, tz) < d.date ? 0 : minutesAt(t.starts_at, tz);
              const to = dayAt(t.ends_at, tz) > d.date ? 24 * 60 : minutesAt(t.ends_at, tz);
              return sum + Math.max(0, to - from);
            }, 0);
          const working = d.shift ? toMinutes(d.shift.ends) - toMinutes(d.shift.starts) : 0;
          const free = Math.max(0, working - booked - blocked);
          return (
            <li
              key={d.date}
              className={cn(
                "flex flex-col gap-2 rounded-[var(--radius-card)] border bg-surface p-3",
                d.date === today ? "border-spruce" : "border-line",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(d.date)}
                className="flex min-h-11 flex-col items-start rounded-lg text-left hover:text-spruce"
              >
                <span className="font-bold">
                  {dayName.format(parseDate(d.date))}
                  {d.date === today && <span className="text-spruce"> · Today</span>}
                </span>
                <span className="text-xs text-muted">
                  {d.shift
                    ? `${d.shift.starts}–${d.shift.ends} · ${free ? `${formatDuration(free)} free` : "Full"}`
                    : "Day off"}
                </span>
              </button>
              {own.length === 0 ? (
                <p className="text-sm text-muted">{d.shift ? "No appointments" : ""}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {own.map((b) => {
                    const kind = kindOf(b);
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => onOpenDay(d.date, b.id)}
                          className={cn(
                            "flex min-h-11 w-full flex-col rounded-lg border-l-4 px-2 py-1 text-left text-xs text-ink hover:shadow-md",
                            (kind === "done" || kind === "no-show") && "text-muted",
                          )}
                          style={blockStyle(kind, color)}
                        >
                          <span className="flex items-baseline gap-1 font-bold">
                            <span aria-hidden="true">{KIND[kind].mark}</span>
                            <span className={cn(kind === "no-show" && "line-through")}>
                              {clock(minutesAt(b.starts_at, tz))} {b.client_name}
                            </span>
                          </span>
                          <span className="truncate">
                            {b.service_name} · {KIND[kind].label}
                          </span>
                          {b.client_flags.includes("risk") && (
                            <span className="font-bold text-danger">{FLAG_TEXT.risk}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function List({
  board,
  bookings,
  colors,
  onPick,
}: {
  board: Board;
  bookings: Booking[];
  colors: Map<string, StaffColor>;
  onPick: (id: string) => void;
}) {
  const name = (id: string) => board.staff.find((s) => s.id === id)?.display_name ?? "";
  if (bookings.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8 text-muted">
        No appointments on this day.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="border-b border-line text-xs tracking-[var(--tracking-label)] text-muted uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              Time
            </th>
            <th scope="col" className="px-4 py-3">
              Client
            </th>
            <th scope="col" className="px-4 py-3">
              Service
            </th>
            <th scope="col" className="px-4 py-3">
              With
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-b border-line last:border-b-0 hover:bg-mint/60">
              <td className="px-4 py-2">
                <button
                  type="button"
                  className="min-h-11 font-semibold text-spruce underline-offset-4 hover:underline"
                  onClick={() => onPick(b.id)}
                >
                  {clock(minutesAt(b.starts_at, board.timezone))}–{clock(minutesAt(b.ends_at, board.timezone))}
                </button>
              </td>
              <td className="px-4 py-2 font-semibold">
                {b.client_name} <Flags flags={b.client_flags} />
              </td>
              <td className="px-4 py-2">
                {b.service_name}
                <span className="block text-xs text-muted">{KIND[kindOf(b)].label}</span>
              </td>
              <td className="px-4 py-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: colors.get(b.staff_id)?.accent }}
                  />
                  {name(b.staff_id)}
                </span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{formatPrice(b.price_minor, b.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- panels ----------------------------------------------------------------------------------

const FLAG_TEXT = { risk: "2+ no-shows here", regular: "Regular" } as const;

/** This venue's flags for a customer. Text, not colour alone, carries the meaning. */
function Flags({ flags, className }: { flags: Booking["client_flags"]; className?: string }) {
  if (flags.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {flags.map((f) => (
        <span
          key={f}
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-bold",
            f === "risk" ? "bg-danger-soft text-danger" : "bg-mint-strong text-spruce",
          )}
        >
          {FLAG_TEXT[f]}
        </span>
      ))}
    </span>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <h2 className="text-xl font-bold">{title}</h2>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-[var(--radius-control)] hover:bg-mint"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

function TimeSelect({
  label,
  name,
  defaultValue,
  from = 0,
  to = ROWS,
  error,
}: {
  label: string;
  name: string;
  defaultValue: string;
  from?: number;
  to?: number;
  error?: string;
}) {
  return (
    <Select label={label} name={name} defaultValue={defaultValue} error={error} required>
      {QUARTERS.slice(from, to + 1).map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  );
}

function Textarea({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`f-${name}`} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={`f-${name}`}
        name={name}
        defaultValue={defaultValue}
        maxLength={1000}
        rows={3}
        className="rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 py-3 text-base hover:border-muted focus:border-spruce focus:shadow-[var(--shadow-focus-ring)]"
      />
    </div>
  );
}

function WalkInForm({
  businessId,
  board,
  staffId,
  time,
  onClose,
  onSaved,
}: {
  businessId: string;
  board: Board;
  staffId: string;
  time: string;
  onClose: () => void;
  onSaved: (text: string) => Promise<void>;
}) {
  const [staff, setStaff] = useState(staffId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { errors, check, clear } = useFieldErrors();
  const people = board.staff.filter((s) => board.can_book_staff_ids.includes(s.id));
  const offered = board.services.filter((s) => s.staff_ids.includes(staff));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !check(event.currentTarget)) return;
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      await api(`/businesses/${businessId}/bookings/walk-in`, {
        method: "POST",
        body: {
          staff_id: staff,
          service_id: text("service"),
          start: `${board.date}T${text("time")}`,
          guest: { name: text("name"), phone: text("phone") || null, email: text("email") || null },
          notes: text("notes"),
        },
      });
      await onSaved(`Booked ${text("name")} at ${text("time")}.`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PanelHeader title="New appointment" onClose={onClose} />
      <form
        method="post"
        noValidate
        onSubmit={onSubmit}
        onInput={(e) => clear((e.target as { name?: string }).name ?? "")}
        className="flex flex-col gap-4"
      >
        <FormError message={error} />
        <Field
          label="Client name"
          name="name"
          autoComplete="off"
          maxLength={80}
          data-missing="Enter the client's name."
          error={errors.name}
          required
        />
        <Field label="Phone" name="phone" type="tel" autoComplete="off" hint="Optional." maxLength={24} />
        <Field label="Email" name="email" type="email" autoComplete="off" hint="Optional." error={errors.email} />
        <Select label="With" value={staff} onChange={(e) => setStaff(e.target.value)} required>
          {people.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name}
            </option>
          ))}
        </Select>
        {offered.length ? (
          <Select
            key={staff}
            label="Service"
            name="service"
            defaultValue=""
            data-missing="Choose a service."
            error={errors.service}
            required
          >
            <option value="" disabled>
              Choose a service
            </option>
            {offered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatDuration(s.duration_minutes)} · {formatPrice(s.price_minor, s.currency)}
              </option>
            ))}
          </Select>
        ) : (
          <p className="rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-sm">
            This person has no services yet. Assign some on the Team page first.
          </p>
        )}
        <TimeSelect label={`Starts on ${longDate(board.date)}`} name="time" defaultValue={time} to={ROWS - 1} />
        <Textarea label="Notes" name="notes" />
        <Button type="submit" loading={busy} disabled={!offered.length}>
          Book
        </Button>
      </form>
    </>
  );
}

function AppointmentPanel({
  id,
  board,
  onClose,
  onChanged,
}: {
  id: string;
  board: Board;
  onClose: () => void;
  onChanged: (text: string) => Promise<void>;
}) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [confirmPatch, setConfirmPatch] = useState(false);
  const [patchNote, setPatchNote] = useState<string | null>(null);

  useEffect(() => {
    api<BookingDetail>(`/bookings/${id}`)
      .then((d) => {
        setDetail(d);
        setStarted(new Date(d.starts_at).getTime() <= Date.now());
      })
      .catch((e: unknown) => setError(message(e)));
  }, [id]);

  if (!detail) {
    return (
      <>
        <PanelHeader title="Appointment" onClose={onClose} />
        <FormError message={error} />
        {!error && <p className="text-muted">Loading…</p>}
      </>
    );
  }

  const tz = board.timezone;
  const start = minutesAt(detail.starts_at, tz);
  const end = minutesAt(detail.ends_at, tz);
  const open = detail.status === "pending" || detail.status === "confirmed";
  const mayChange = open && board.can_book_staff_ids.includes(detail.staff_id);
  const mayMark = detail.status === "confirmed" && started && board.can_mark_staff_ids.includes(detail.staff_id);
  // Patch tests are kept on the customer's account at this venue, so not for walk-in guests.
  const mayRecord =
    detail.source === "consumer" &&
    detail.status !== "cancelled" &&
    detail.needs_patch_test &&
    board.can_mark_staff_ids.includes(detail.staff_id);
  const person = board.staff.find((s) => s.id === detail.staff_id)?.display_name ?? "";
  const chosen = staff ?? detail.staff_id;
  const people = board.staff.filter((s) => board.can_book_staff_ids.includes(s.id));
  const offered = board.services.filter((s) => s.staff_ids.includes(chosen));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !detail) return;
    const form = new FormData(event.currentTarget);
    const body: Record<string, string> = {};
    const time = String(form.get("time"));
    if (time !== clock(start)) body.start = `${board.date}T${time}`;
    if (chosen !== detail.staff_id) body.staff_id = chosen;
    const service = String(form.get("service") ?? detail.service_id);
    if (service !== detail.service_id) body.service_id = service;
    const notes = String(form.get("notes") ?? "");
    if (notes !== detail.notes) body.notes = notes;
    setBusy(true);
    setError(null);
    try {
      await api(`/bookings/${detail.id}`, { method: "PATCH", body });
      await onChanged("Appointment updated.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function noShow() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/bookings/${detail.id}/no-show`, { method: "PATCH" });
      await onChanged(`Marked ${detail.client_name} as a no-show.`);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  async function recordPatchTest() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      setDetail(await api<BookingDetail>(`/bookings/${detail.id}/patch-test`, { method: "POST" }));
      setConfirmPatch(false);
      setPatchNote(`Patch test recorded for ${detail.client_name} today.`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/bookings/${detail.id}/cancel`, { method: "PATCH" });
      await onChanged(`Cancelled ${detail.client_name}'s appointment. The slot is free again.`);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PanelHeader title={detail.client_name} onClose={onClose} />
      <Flags flags={detail.client_flags} />
      <FormError message={error} />
      {!editing ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted">When</dt>
            <dd className="font-semibold">
              {clock(start)}–{clock(end)}, {longDate(board.date)}
            </dd>
            <dt className="text-muted">Service</dt>
            <dd>
              {detail.service_name} · {formatPrice(detail.price_minor, detail.currency)}
            </dd>
            <dt className="text-muted">With</dt>
            <dd>{person}</dd>
            {detail.resource_name && (
              <>
                <dt className="text-muted">Room</dt>
                <dd>{detail.resource_name}</dd>
              </>
            )}
            {detail.guest_phone && (
              <>
                <dt className="text-muted">Phone</dt>
                <dd>
                  <a href={`tel:${detail.guest_phone}`} className="text-spruce underline underline-offset-4">
                    {detail.guest_phone}
                  </a>
                </dd>
              </>
            )}
            {detail.guest_email && (
              <>
                <dt className="text-muted">Email</dt>
                <dd className="break-all">{detail.guest_email}</dd>
              </>
            )}
            <dt className="text-muted">Notes</dt>
            <dd className="whitespace-pre-line">{detail.notes || "None"}</dd>
            {(detail.needs_patch_test || detail.patch_test_at) && (
              <>
                <dt className="text-muted">Patch test</dt>
                <dd>
                  {detail.patch_test_at
                    ? `Done ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(new Date(detail.patch_test_at))}`
                    : "None recorded"}
                </dd>
              </>
            )}
            {detail.sale && (
              <>
                <dt className="text-muted">Paid</dt>
                <dd className="font-semibold">
                  {formatPrice(detail.sale.price_minor, detail.sale.currency)},{" "}
                  {METHODS[detail.sale.method].toLowerCase()}
                  {detail.sale.tip_minor > 0 && ` · tip ${formatPrice(detail.sale.tip_minor, detail.sale.currency)}`}
                </dd>
              </>
            )}
            {(detail.status === "completed" || detail.status === "no_show") && (
              <>
                <dt className="text-muted">Outcome</dt>
                <dd className="font-semibold">{detail.status === "completed" ? "Done" : "No-show"}</dd>
              </>
            )}
          </dl>
          {detail.form !== "none" && <VisitAnswers bookingId={detail.id} state={detail.form} />}
          {patchNote && (
            <p
              role="status"
              className="rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm font-semibold text-spruce"
            >
              {patchNote}
            </p>
          )}
          {mayRecord && !confirmPatch && (
            <Button variant="secondary" className="self-start" disabled={busy} onClick={() => setConfirmPatch(true)}>
              Record patch test today
            </Button>
          )}
          {mayRecord && confirmPatch && (
            <div
              role="alertdialog"
              aria-labelledby="patch-q"
              className="flex flex-col gap-3 rounded-[var(--radius-control)] bg-warn-soft p-4"
            >
              <p id="patch-q" className="text-sm font-semibold">
                Record that {detail.client_name} had a patch test here today? They can then book this service online
                from 48 hours from now.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button loading={busy} onClick={recordPatchTest} autoFocus>
                  Yes, record it
                </Button>
                <Button variant="ghost" onClick={() => setConfirmPatch(false)} disabled={busy}>
                  Not now
                </Button>
              </div>
            </div>
          )}
          {detail.needs_patch_test && detail.source !== "consumer" && (
            <p className="text-sm text-muted">
              Patch tests are kept on a customer&apos;s Spruce account, so they can&apos;t be recorded for a walk-in.
            </p>
          )}
          {mayMark && !checkingOut && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => setCheckingOut(true)}>
                Check out
              </Button>
              <Button variant="secondary" disabled={busy} onClick={noShow}>
                No-show
              </Button>
            </div>
          )}
          {mayMark && checkingOut && (
            <Checkout detail={detail} onDone={(paid) => onChanged(paid)} onBack={() => setCheckingOut(false)} />
          )}
          {mayChange && !confirmCancel && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit or move
              </Button>
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                Cancel appointment
              </Button>
            </div>
          )}
          {confirmCancel && (
            <div
              role="alertdialog"
              aria-labelledby="cancel-q"
              className="flex flex-col gap-3 rounded-[var(--radius-control)] bg-danger-soft p-4"
            >
              <p id="cancel-q" className="text-sm font-semibold text-danger">
                Cancel {detail.client_name}&apos;s appointment at {clock(start)}?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" loading={busy} onClick={cancel}>
                  Yes, cancel it
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <form method="post" noValidate onSubmit={save} className="flex flex-col gap-4">
          {people.length > 1 && (
            <Select label="With" value={chosen} onChange={(e) => setStaff(e.target.value)}>
              {people.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </Select>
          )}
          <Select key={chosen} label="Service" name="service" defaultValue={detail.service_id}>
            {offered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatDuration(s.duration_minutes)}
              </option>
            ))}
          </Select>
          <TimeSelect label="Starts" name="time" defaultValue={clock(start)} to={ROWS - 1} />
          <Textarea label="Notes" name="notes" defaultValue={detail.notes} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Back
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

const METHODS = { card: "Card", cash: "Cash", other: "Other" } as const;

/** "35", "35.5" or "35,50" to cents. Null when it isn't an amount. */
function toMinor(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Records what was paid at the venue and finishes the visit (slice 14). Spruce takes no money. */
function Checkout({
  detail,
  onDone,
  onBack,
}: {
  detail: BookingDetail;
  onDone: (text: string) => Promise<void>;
  onBack: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [errors, setErrors] = useState<{ price?: string; tip?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const price = toMinor(String(form.get("price")));
    const tip = String(form.get("tip")).trim() ? toMinor(String(form.get("tip"))) : 0;
    const found = {
      price: price === null ? "Enter an amount like 35 or 35.50." : undefined,
      tip: tip === null ? "Enter a tip like 5, or leave it empty." : undefined,
    };
    setErrors(found);
    if (price === null || tip === null) {
      event.currentTarget.querySelector<HTMLInputElement>(price === null ? "[name=price]" : "[name=tip]")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/bookings/${detail.id}/checkout`, {
        method: "POST",
        body: { price_minor: price, tip_minor: tip, method },
      });
      await onDone(`Checked out ${detail.client_name}: ${formatPrice(price + tip, detail.currency)} paid.`);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="checkout-title"
      className="flex flex-col gap-4 rounded-[var(--radius-control)] bg-ground p-4"
    >
      <h3 id="checkout-title" className="font-bold">
        Check out
      </h3>
      <FormError message={error} />
      <Field
        label="Amount for the service"
        name="price"
        inputMode="decimal"
        defaultValue={(detail.price_minor / 100).toFixed(2)}
        hint={`In ${detail.currency}. Change it for a discount or an extra.`}
        error={errors.price}
        onInput={() => setErrors((e) => ({ ...e, price: undefined }))}
        required
      />
      <Field
        label="Tip"
        name="tip"
        inputMode="decimal"
        placeholder="0"
        hint="Goes to the person in full, with no commission."
        error={errors.tip}
        onInput={() => setErrors((e) => ({ ...e, tip: undefined }))}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">Paid by</legend>
        <div className="flex flex-wrap gap-x-5">
          {(Object.keys(METHODS) as PaymentMethod[]).map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="method"
                value={m}
                checked={method === m}
                onChange={() => setMethod(m)}
                className="size-5 accent-spruce"
              />
              {METHODS[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          Confirm checkout
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
      </div>
    </form>
  );
}

/** A visit's consultation answers (slice 13). Fetched only when asked for, since each read is audited. */
function VisitAnswers({ bookingId, state }: { bookingId: string; state: "to_fill" | "filled" }) {
  const [form, setForm] = useState<VisitForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setBusy(true);
    setError(null);
    try {
      setForm(await api<VisitForm>(`/bookings/${bookingId}/form`));
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "Only the owner and the person doing this visit can read the answers."
          : message(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={`answers-${bookingId}`}
      className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-ground p-3"
    >
      <h3 id={`answers-${bookingId}`} className="text-sm font-semibold">
        Consultation form
      </h3>
      {state === "to_fill" ? (
        <p className="text-sm text-muted">Not filled in yet.</p>
      ) : form ? (
        <dl className="flex flex-col gap-2 text-sm">
          {form.questions.map((q, i) => {
            const a = form.answers?.[i];
            return (
              <div key={i}>
                <dt className="text-muted">{q.label}</dt>
                <dd className="whitespace-pre-line font-semibold">
                  {a === true ? (
                    // A yes often means something to check before the visit, so it stands out.
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5">
                      <span aria-hidden="true">!</span> Yes
                    </span>
                  ) : a === false ? (
                    "No"
                  ) : (
                    a || "No answer"
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <>
          {error ? (
            <p className="text-sm">{error}</p>
          ) : (
            <Button variant="secondary" className="self-start" loading={busy} onClick={show}>
              Show answers
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function BlockForm({
  board,
  staffId,
  time,
  onClose,
  onSaved,
}: {
  board: Board;
  staffId: string;
  time: string;
  onClose: () => void;
  onSaved: (text: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { errors, check, clear } = useFieldErrors();
  const startIndex = Math.max(0, QUARTERS.indexOf(time));
  const endDefault = QUARTERS[Math.min(ROWS, startIndex + 4)];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !check(event.currentTarget)) return;
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "").trim();
    const until = text("until") || board.date;
    const start = `${board.date}T${text("from")}`;
    const end = `${until}T${text("to")}`;
    if (end <= start) {
      setError("Blocked time must end after it starts.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/${text("staff")}/time-off`, {
        method: "POST",
        body: { start, end, reason: text("reason") },
      });
      await onSaved("Time blocked.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PanelHeader title="Block time" onClose={onClose} />
      <form
        method="post"
        noValidate
        onSubmit={onSubmit}
        onInput={(e) => clear((e.target as { name?: string }).name ?? "")}
        className="flex flex-col gap-4"
      >
        <FormError message={error} />
        <Select label="Who" name="staff" defaultValue={staffId} required>
          {board.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <TimeSelect label="From" name="from" defaultValue={QUARTERS[startIndex]} to={ROWS - 1} />
          <TimeSelect label="To" name="to" defaultValue={endDefault} from={1} />
        </div>
        <Field
          label="Ends on"
          name="until"
          type="date"
          defaultValue={board.date}
          min={board.date}
          hint="Change it for time off that lasts several days."
          error={errors.until}
        />
        <Field label="Reason" name="reason" maxLength={60} hint="Optional, for example Lunch or Holiday." />
        <Button type="submit" loading={busy}>
          Block time
        </Button>
      </form>
    </>
  );
}

function TimeOffPanel({
  block,
  board,
  tz,
  onClose,
  onSaved,
}: {
  block: TimeOff;
  board: Board;
  tz: string;
  onClose: () => void;
  onSaved: (text: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const person = board.staff.find((s) => s.id === block.staff_id)?.display_name ?? "";
  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/time-off/${block.id}`, { method: "DELETE" });
      await onSaved("Blocked time removed.");
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PanelHeader title={block.reason || "Blocked time"} onClose={onClose} />
      <FormError message={error} />
      <p className="mb-4 text-sm">
        {person}, {when(block.starts_at)} to {when(block.ends_at)}
      </p>
      <Button variant="secondary" loading={busy} onClick={remove}>
        Remove blocked time
      </Button>
    </>
  );
}
