import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeaveCtrl",
  description: "Leave and workforce availability, made simple.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
