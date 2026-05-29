import type { ReactNode } from "react"
import type { Viewport } from "next"
import "./globals.css"
import MobileNav from "../components/MobileNav"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0f172a",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <MobileNav />
      </body>
    </html>
  )
}
