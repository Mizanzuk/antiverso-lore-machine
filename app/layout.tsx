import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AntiVerso Lore Machine",
  description: "Ferramenta de administração e upload para o AntiVerso",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen w-screen overflow-y-auto bg-[#050509] text-gray-100">
        {children}
      </body>
    </html>
  );
}
