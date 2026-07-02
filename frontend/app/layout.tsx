import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DJ Remix Studio",
  description:
    "Upload an acapella and an instrumental, auto beat/key match, and mash them into a pro remix.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
