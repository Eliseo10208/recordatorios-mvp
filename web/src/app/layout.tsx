import type { Metadata } from "next";

import "./globals.css";
import "./ui-polish.css";
import "./dashboard-refresh.css";

export const metadata: Metadata = {
  title: "Recordatorios",
  description: "Tus recordatorios, a tiempo y en un solo lugar.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
