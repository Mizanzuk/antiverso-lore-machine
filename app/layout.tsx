
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AntiVerso Lore Machine",
  description: "Chat com Or sobre o AntiVerso, com RAG em cima da sua bíblia de lore.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="h-screen w-screen overflow-hidden bg-[#050509] text-gray-100">
        {children}
      </body>
    </html>
  );
}
