import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lore Machine",
  description: "A powerful tool for managing fictional universes",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen w-screen overflow-y-auto bg-[#050509] text-gray-100">
        {children}
      </body>
    </html>
  );
}
