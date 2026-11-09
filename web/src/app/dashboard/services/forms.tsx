"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { api, type ConsultationForm, type Question, type Service } from "@/lib/api";

const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't work.");
const FIRST: Question = { label: "Anything we should know before your visit?", kind: "text" };
const MAX_QUESTIONS = 30;

/**
 * Consultation forms (slice 13). Customers who book a service ticked here fill the form in from
 * Your bookings; the owner and the person doing the visit read the answers on the appointment.
 */
export function Forms({ businessId, services }: { businessId: string; services: Service[] }) {
  const [forms, setForms] = useState<ConsultationForm[] | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<ConsultationForm[]>(`/businesses/${businessId}/forms`).then((f) => {
        setForms(f);
        setVersion((v) => v + 1);
      }),
    [businessId],
  );

  useEffect(() => {
    load().catch((e: unknown) => setError(message(e)));
  }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const name = String(new FormData(formEl).get("name") ?? "").trim();
    if (!name) {
      setNameError("Enter a name, like Skin consultation.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const made = await api<ConsultationForm>(`/businesses/${businessId}/forms`, {
        method: "POST",
        body: { name, questions: [FIRST] },
      });
      setForms((f) => [...(f ?? []), made]);
      setNotice(`Added ${made.name}. Write its questions and tick the services that use it.`);
      formEl.reset();
    } catch (e) {
      setError(message(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <section aria-labelledby="forms-title" className="rise flex flex-col gap-3">
      <div>
        <h2 id="forms-title" className="text-xl font-bold">
          Consultation forms
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Questions clients answer before their visit, such as allergies or medication. Only you and the person doing
          the visit see the answers.
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
      {forms === null && !error && <p className="text-muted">Loading…</p>}
      {forms?.map((f) => (
        <FormCard
          key={`${f.id}-${version}`}
          form={f}
          services={services}
          onSaved={async (saved) => {
            setNotice(`Saved ${saved.name}.`);
            // Ticking a service here moves it off any other form, so reload them all.
            await load().catch((e: unknown) => setError(message(e)));
          }}
          onRemoved={() => {
            setForms((list) => list?.filter((x) => x.id !== f.id) ?? null);
            setNotice(`Removed ${f.name}. Answers already given stay with their appointments.`);
          }}
        />
      ))}
      <form
        onSubmit={add}
        noValidate
        aria-label="Add a consultation form"
        className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-4"
      >
        <Field
          label="New form"
          name="name"
          maxLength={80}
          placeholder="Skin consultation"
          className="min-w-48 flex-1"
          error={nameError ?? undefined}
          onInput={() => setNameError(null)}
        />
        <Button type="submit" variant="secondary" loading={adding}>
          Add
        </Button>
      </form>
    </section>
  );
}

function FormCard({
  form,
  services,
  onSaved,
  onRemoved,
}: {
  form: ConsultationForm;
  services: Service[];
  onSaved: (form: ConsultationForm) => Promise<void>;
  onRemoved: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>(form.questions);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `form-${form.id}`;

  function change(index: number, next: Partial<Question>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...next } : q)));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const cleaned = questions.map((q) => ({ ...q, label: q.label.trim() }));
    if (cleaned.some((q) => !q.label)) {
      setError("Write each question, or remove the empty ones.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await api<ConsultationForm>(`/forms/${form.id}`, {
        method: "PATCH",
        body: {
          name: String(data.get("name") ?? "").trim(),
          questions: cleaned,
          service_ids: data.getAll("service").map(String),
        },
      });
      await onSaved(saved);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/forms/${form.id}`, { method: "DELETE" });
      onRemoved();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      noValidate
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <h3 id={titleId} className="font-bold">
        {form.name}
      </h3>
      <FormError message={error} />
      <Field label="Name" name="name" defaultValue={form.name} maxLength={80} required />
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Questions</legend>
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2 rounded-[var(--radius-control)] bg-ground p-3">
              <Field
                label={`Question ${i + 1}`}
                value={q.label}
                onChange={(e) => change(i, { label: e.target.value })}
                maxLength={200}
                className="min-w-48 flex-1"
              />
              <Select
                label="Answer"
                value={q.kind}
                onChange={(e) => change(i, { kind: e.target.value as Question["kind"] })}
                className="w-36"
                aria-label={`Answer type for question ${i + 1}`}
              >
                <option value="text">In words</option>
                <option value="yes_no">Yes or no</option>
              </Select>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setQuestions((qs) => qs.filter((_, x) => x !== i))}
                  className="flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-mint"
                >
                  <Icon name="close" />
                  <span className="sr-only">Remove question {i + 1}</span>
                </button>
              )}
            </li>
          ))}
        </ol>
        {questions.length < MAX_QUESTIONS && (
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => setQuestions((qs) => [...qs, { label: "", kind: "yes_no" }])}
          >
            Add a question
          </Button>
        )}
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">Used for</legend>
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
                  defaultChecked={form.service_ids.includes(s.id)}
                  className="size-5 shrink-0 accent-spruce"
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1 text-sm text-muted">A service uses one form. Ticking it here takes it off any other.</p>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy && !asking}>
          Save {form.name}
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
