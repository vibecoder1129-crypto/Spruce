"use client";

import { useState } from "react";

/**
 * Field errors in our own words and style, instead of the browser's validation bubbles.
 * Forms using this set `noValidate`, call `check(form)` on submit, and pass `errors[name]`
 * to each field. The first invalid field gets focus, so keyboard and screen reader users
 * land on what needs fixing.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function check(form: HTMLFormElement): boolean {
    const found: Record<string, string> = {};
    let first: HTMLInputElement | HTMLSelectElement | null = null;
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || !el.name || el.disabled) continue;
      if (el.name in found) continue;
      const message = problem(el);
      if (!message) continue;
      found[el.name] = message;
      first ??= el;
    }
    setErrors(found);
    first?.focus();
    return first === null;
  }

  function clear(name: string) {
    setErrors((current) => {
      if (!(name in current)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  return { errors, check, clear };
}

function problem(el: HTMLInputElement | HTMLSelectElement): string | null {
  if (el instanceof HTMLSelectElement) return el.required && !el.value ? (el.dataset.missing ?? "Choose one to continue.") : null;
  if (el.type === "radio") {
    const picked = el.form?.querySelector(`input[type=radio][name="${CSS.escape(el.name)}"]:checked`);
    return el.required && !picked ? (el.dataset.missing ?? "Choose one to continue.") : null;
  }
  const value = el.value.trim();
  if (el.type === "checkbox") return el.required && !el.checked ? "Tick this box to continue." : null;
  if (el.required && !value) return el.dataset.missing ?? "Fill this in to continue.";
  if (!value) return null;
  if (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter an email like name@example.com.";
  if (el.minLength > 0 && el.value.length < el.minLength) {
    return `Use at least ${el.minLength} characters. You have ${el.value.length}.`;
  }
  if (el.pattern && !new RegExp(`^(?:${el.pattern})$`).test(el.value)) return el.title || "Check the format.";
  return null;
}
