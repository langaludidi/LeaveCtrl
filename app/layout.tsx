import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://app.leavectrl.co.za";
const title = "LeaveCtrl | Leave & Workforce Availability";
const description =
  "Simple, governed leave management, workforce availability, approvals and TOIL in one calm operational workspace.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "LeaveCtrl",
  title: {
    default: title,
    template: "%s | LeaveCtrl",
  },
  description,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "LeaveCtrl",
    title,
    description,
    images: [
      {
        url: "/api/social-image",
        width: 1200,
        height: 630,
        alt: "LeaveCtrl — Smarter Leave Management for Modern Teams",
      },
      {
        url: "/social/leavectrl-social-dark.jpg",
        width: 1200,
        height: 630,
        alt: "LeaveCtrl dark social sharing card",
      },
      {
        url: "/social/leavectrl-social-light.jpg",
        width: 1200,
        height: 630,
        alt: "LeaveCtrl light social sharing card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/api/social-image"],
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
