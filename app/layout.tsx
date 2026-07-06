import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { NotificationStack } from "@/components/NotificationStack";
import { getSession } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gunna · AI Running Coach",
  description: "Upload your runs and train with an AI coach.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <Nav email={session?.email ?? null} />
          <main className="flex-1 min-w-0">{children}</main>
          <NotificationStack authed={!!session?.email} />
        </div>
      </body>
    </html>
  );
}
