"use client";

import { useEffect, useState } from "react";
import { joinWaitlist, onWaitlist } from "@/lib/attribution";
import { useI18n } from "@/lib/i18n";
import type { Product } from "@/lib/products";
import { ensureLearner } from "@/lib/supabase";

/**
 * Leave an e-mail address for a product that cannot be had yet: one that is coming, or one for sale before paying in
 * the app works. Who leaves one shows real demand and is the first to hear (docs/producten.md). `line` replaces the
 * product's own text (e.g. "paying is coming soon").
 */
export function Waitlist({ product, track = null, line }: { product: Product; track?: string | null; line?: string }) {
  const { lang, dict, edition } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "invalid" | "error">("idle");
  const text = product.texts[edition.base];

  useEffect(() => {
    void onWaitlist(edition.slug, product.slug).then((on) => on && setState("done"), () => {});
  }, [edition.slug, product.slug]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setState("invalid");
    setState("sending");
    try {
      await joinWaitlist(await ensureLearner(lang), edition.slug, track, product.slug, email);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="card waitlist">
      <strong>
        {text.icon} {text.title}
      </strong>
      <p className="muted small">{line ?? text.text}</p>
      {state === "done" ? (
        <p>{dict.waitlist.thanks}</p>
      ) : (
        <form onSubmit={send}>
          <input
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            placeholder={dict.waitlist.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="primary" disabled={state === "sending"}>
            {dict.waitlist.join}
          </button>
          {state === "invalid" && <p className="small">{dict.waitlist.invalid}</p>}
          {state === "error" && <p className="small">{dict.waitlist.error}</p>}
        </form>
      )}
    </section>
  );
}
