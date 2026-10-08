"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  email: z.email("Introduce un correo válido"),
  password: z.string().min(12, "Usa al menos 12 caracteres").max(128),
});
type FormData = z.infer<typeof schema>;

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  const creating = mode === "register";

  async function submit(data: FormData) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (creating) {
        const response = await fetch("/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          setError(
            response.status === 409
              ? "Este correo ya está registrado."
              : "No se pudo crear la cuenta.",
          );
          return;
        }
      }
      const result = await signIn("credentials", { ...data, redirect: false });
      if (result?.error) {
        setError(
          "No se pudo iniciar sesión. Comprueba tus datos e inténtalo de nuevo.",
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("El servicio no está disponible. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" /> Recordatorios
      </div>
      <section className="auth-card" aria-labelledby="auth-heading">
        <p className="eyebrow">UN ESPACIO PARA LO IMPORTANTE</p>
        <h1 id="auth-heading">
          {creating ? "Crea tu cuenta" : "Qué bueno verte de nuevo"}
        </h1>
        <p className="muted">
          {creating
            ? "Empieza a organizar tus próximos avisos."
            : "Entra para ver tus recordatorios."}
        </p>
        <form onSubmit={handleSubmit(submit)} noValidate>
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            disabled={busy}
            {...register("email")}
          />
          {formState.errors.email && (
            <p className="field-error">{formState.errors.email.message}</p>
          )}
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete={creating ? "new-password" : "current-password"}
            disabled={busy}
            {...register("password")}
          />
          {formState.errors.password && (
            <p className="field-error">{formState.errors.password.message}</p>
          )}
          <div className="feedback-slot" aria-live="polite">
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <button type="submit" disabled={busy}>
            {busy
              ? creating
                ? "Creando cuenta…"
                : "Iniciando sesión…"
              : creating
                ? "Crear cuenta"
                : "Entrar"}
          </button>
        </form>
        <p className="switch-link">
          {creating ? "¿Ya tienes cuenta? " : "¿Primera vez aquí? "}
          <Link href={creating ? "/login" : "/register"}>
            {creating ? "Inicia sesión" : "Crea una cuenta"}
          </Link>
        </p>
        {!creating && (
          <p className="switch-link">
            <Link href="/forgot-password">Olvidé mi contraseña</Link>
          </p>
        )}
      </section>
      <p className="footer-note">Tus planes, en su momento.</p>
    </main>
  );
}
