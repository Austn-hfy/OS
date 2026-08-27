"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="login-shell">
          <section className="login-panel" style={{ margin: "auto", maxWidth: 720 }}>
            <p className="eyebrow">HFY OS</p>
            <h1>Something went wrong.</h1>
            <p>The error has been recorded. Try the action again, or return in a moment.</p>
            <button className="button" type="button" onClick={reset}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}
