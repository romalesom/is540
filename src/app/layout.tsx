import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { getRole } from "@/lib/role";
import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MES Inventory",
  description: "Inventory management for MES-Solutions coffee machines",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const role = await getRole();
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <head>
        {/* Icon font uses display=block so ligature names never flash as text. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..600,0..1,0&display=block"
        />
      </head>
      <body className="min-h-full md:flex">
        <Sidebar role={role} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8 print:p-0">{children}</main>
      </body>
    </html>
  );
}
