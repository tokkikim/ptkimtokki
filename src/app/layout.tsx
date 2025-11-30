import type { Metadata } from "next";
import { Jua, VT323 } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import Script from "next/script";
import GoogleAnalytics, { GA_TRACKING_ID } from "@/components/GoogleAnalytics";
import Header from "@/components/Header";

const jua = Jua({
  weight: "400",
  variable: "--font-jua",
  subsets: ["latin"],
});

const vt323 = VT323({
  weight: "400",
  variable: "--font-vt323",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "tokkikim's photo booth 📸",
  description: "tokkikim's photo booth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${jua.variable} ${vt323.variable} antialiased font-sans`}
      >
        <ThemeProvider>
          <GoogleAnalytics />
          <Header />
          <main className="pt-14 min-h-screen">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
