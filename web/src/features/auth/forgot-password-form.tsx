"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({ email: z.email("Introduce un correo válido") });
type FormData = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const { register, handleSubmit, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function submit(data: FormData) {
    setError("");
    try {
      const response = await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("unavailable");
      setSent(true);
    } catch {
      setError("No se pudo procesar la solicitud. Inténtalo más tarde.");
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Recupera tu contraseña</h1>
        {sent ? (
          <p role="status">
            Si existe una cuenta con ese correo, recibirás un enlace para
            restablecer la contraseña.
          </p>
        ) : (
          <form onSubmit={handleSubmit(submit)} noValidate>
            <p className="muted">
              Te enviaremos un enlace si el correo está registrado.
            </p>
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
            />
            {formState.errors.email && (
              <p className="field-error">{formState.errors.email.message}</p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={formState.isSubmitting}>
              Solicitar enlace
            </button>
          </form>
        )}
        <p className="switch-link">
          <Link href="/login">Volver a iniciar sesión</Link>
        </p>
      </section>
    </main>
  );
}
