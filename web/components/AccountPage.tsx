"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import {
  type Account,
  type CodeFor,
  currentAccount,
  logOut,
  marketingConsent,
  sendCode,
  setMarketing,
  verifyCode,
} from "@/lib/account";
import { useI18n } from "@/lib/i18n";
import { ownedProducts, PRODUCTS } from "@/lib/products";
import { ensureLearner } from "@/lib/supabase";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The account page (docs/accounts.md). Without an address: why to save the progress, one e-mail field (new address:
 * this account is saved; known address: log in to it) and then the 6-digit code. With an address: who you are, your
 * packs, the yes/no to tips, and logging out.
 */
export function AccountPage() {
  const { lang, dict, fill, edition, home } = useI18n();
  const [account, setAccount] = useState<Account | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [marketing, setMarketingState] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeFor, setCodeFor] = useState<CodeFor | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await ensureLearner(lang);
      const me = await currentAccount();
      setAccount(me);
      setOwned(await ownedProducts());
      if (me && !me.anonymous) setMarketingState(await marketingConsent(me.id));
    })().catch((e) => setProblem(String(e.message ?? e)));
  }, [lang]);

  const explain = (e: { code?: string; message?: string; status?: number }) =>
    e.status === 429 || /rate limit/i.test(e.message ?? "") ? dict.account.tooMany : String(e.message ?? e);

  async function askCode(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) return setProblem(dict.waitlist.invalid);
    setBusy(true);
    setProblem(null);
    try {
      setCodeFor(await sendCode(email));
    } catch (err) {
      setProblem(explain(err as { message?: string }));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!codeFor) return;
    setBusy(true);
    setProblem(null);
    try {
      await verifyCode(email, code, codeFor, marketing);
      // Start clean as the saved (or logged-in) account: a full load, so every page and the learner cache in
      // lib/supabase.ts start from this account (a client-side push would keep the old learner).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load is the point
      window.location.href = `${home}/account`;
    } catch (err) {
      const status = (err as { status?: number }).status;
      setProblem(status === 429 ? dict.account.tooMany : dict.account.wrongCode);
      setBusy(false);
    }
  }

  async function leave() {
    await logOut();
    window.location.href = home;
  }

  if (!account) {
    return (
      <main>
        <TopBar title={dict.account.title} />
        <p className="muted">{problem ?? dict.common.loading}</p>
      </main>
    );
  }

  const mine = Object.values(PRODUCTS).filter((p) => owned.has(p.slug) && p.texts[edition.base]);

  if (!account.anonymous) {
    return (
      <main>
        <TopBar title={dict.account.title} />
        <section className="card account">
          <p>✅ {fill(dict.account.loggedInAs, { email: account.email ?? "" })}</p>
        </section>
        <h2 className="section-title">{dict.account.products}</h2>
        {mine.length ? (
          <nav className="tiles">
            {mine.map((p) => (
              <Link key={p.slug} href={`${home}/p/${p.slug}`} className="tile">
                <span className="tile-icon">{p.texts[edition.base].icon}</span>
                <strong>{p.texts[edition.base].title}</strong>
                <span className="tile-sub">{dict.product.owned}</span>
              </Link>
            ))}
          </nav>
        ) : (
          <p className="muted">{dict.account.noProducts}</p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => {
              setMarketingState(e.target.checked);
              void setMarketing(account.id, e.target.checked);
            }}
          />
          {dict.account.marketing}
        </label>
        <button className="link muted" onClick={() => void leave()}>
          {dict.account.logout}
        </button>
        <p className="muted small">{dict.account.logoutNote}</p>
      </main>
    );
  }

  return (
    <main>
      <TopBar title={dict.account.saveTitle} />
      <section className="card account">
        {!codeFor ? (
          <form onSubmit={askCode}>
            <p>{dict.account.saveWhy}</p>
            <input
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              placeholder={dict.account.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="check">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketingState(e.target.checked)} />
              {dict.account.marketing}
            </label>
            <button className="primary" disabled={busy}>
              {dict.account.send}
            </button>
            <p className="muted small">{dict.account.haveAccount}</p>
          </form>
        ) : (
          <form onSubmit={confirm}>
            <p>{fill(codeFor === "save" ? dict.account.sentSave : dict.account.sentLogin, { email: email.trim() })}</p>
            {codeFor === "login" && <p className="muted small">{dict.account.loginNote}</p>}
            <input
              className="code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={dict.account.code}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button className="primary" disabled={busy || code.length !== 6}>
              {dict.account.confirm}
            </button>
            <button
              type="button"
              className="link muted"
              onClick={() => {
                setCodeFor(null);
                setCode("");
                setProblem(null);
              }}
            >
              {dict.account.other}
            </button>
          </form>
        )}
        {problem && <p className="small">{problem}</p>}
      </section>
    </main>
  );
}
