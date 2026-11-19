import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "@fontsource/marcellus/400.css";
import "@fontsource-variable/albert-sans";
import "./globals.css";
import { ConvexClientProvider } from "@/components/providers";

export const metadata: Metadata = {
  title: "Tamika Rich Coaching",
  description: "Coaching for women who are starting a business, starting over, or pivoting.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <ClerkProvider
          appearance={{
            variables: { colorPrimary: "#1d4a43", borderRadius: "6px", fontFamily: "Albert Sans Variable, sans-serif" },
          }}
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
