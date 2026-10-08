"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "verify" | "reset";

export function AccountLinkForm({ mode }: { mode: Mode }) {
  const fragmentToken = useRef<string | null>(null);
  const submitting = useRef(false);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    "waiting" | "ready" | "sending" | "success" | "invalid" | "error"
  >("waiting");

  const submit = useCallback(
    async (value: string, nextPassword?: string) => {
      if (submitting.current) return;
      submitting.current = true;
      setState("sending");
      try {
        const response = await fetch(
          `/api/account/${mode === "verify" ? "verify-email" : "reset-password"}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              mode === "verify"
                ? { token: value }
                : { token: value, new_password: nextPassword },
            ),
          },
        );
        if (response.ok) {
          if (mode === "reset") {
            try {
              await signOut({ redirect: false });
            } catch {
              /* The API already revoked the session. */
            }
          }
          setState("success");
        } else {
          setState(
            response.status === 400 || response.status === 422
              ? "invalid"
              : "error",
          );
        }
      } catch {
        setState("error");
      } finally {
        submitting.current = false;
      }
    },
    [mode],
  );

  useEffect(() => {
    if (fragmentToken.current === null) {
      fragmentToken.current =
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      window.history.replaceState(null, "", window.location.pathname);
    }
    const value = fragmentToken.current;
    const timer = window.setTimeout(() => {
      if (value.length < 40 || value.length > 128) {
        setState("invalid");
        return;
      }
      setToken(value);
      if (mode === "reset") setState("ready");
      else void submit(value);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, submit]);

  const title = mode === "verify" ? "Confirma tu correo" : "Nueva contraseña";
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>{title}</h1>
        <div className="feedback-slot" aria-live="polite">
          {(state === "waiting" || state === "sending") && (
            <p role="status">
              {mode === "reset" && state === "sending"
                ? "Guardando contraseña…"
                : "Procesando el enlace…"}
            </p>
          )}
          {state === "invalid" && (
            <p className="form-error" role="alert">
              El enlace no es válido o ya venció. Solicita uno nuevo.
            </p>
          )}
          {state === "error" && (
            <p className="form-error" role="alert">
              No se pudo procesar el enlace. Inténtalo de nuevo más tarde.
            </p>
          )}
          {state === "success" && (
            <p role="status">
              {mode === "verify"
                ? "Correo confirmado."
                : "Contraseña actualizada. Inicia sesión de nuevo."}
            </p>
          )}
        </div>
        {state === "ready" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (password.length >= 12 && password.length <= 128)
                void submit(token, password);
            }}
          >
            <label htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={state !== "ready"}
            />
            <button type="submit">Guardar contraseña</button>
          </form>
        )}
        {(mode === "verify" || state === "success") && (
          <p className="switch-link">
            <Link href="/login">Ir a iniciar sesión</Link>
          </p>
        )}
      </section>
    </main>
  );
}
