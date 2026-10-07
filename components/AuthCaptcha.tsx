"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme?: "auto" | "light" | "dark";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function AuthCaptcha({
  siteKey,
  label = "Security check",
}: {
  siteKey?: string;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile || widgetRef.current) {
      return;
    }

    widgetRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: setToken,
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
      theme: "auto",
    });
  }, [siteKey]);

  useEffect(() => {
    if (scriptReady) renderWidget();

    return () => {
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, [renderWidget, scriptReady]);

  if (!siteKey) return null;

  return (
    <div className="auth-captcha" aria-label={label}>
      <input type="hidden" name="captchaToken" value={token} />
      <div ref={containerRef} />
      <p className="auth-captcha-note">
        Protected by Cloudflare Turnstile.
      </p>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
    </div>
  );
}
