import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata = {title:"SMRTR — Follow your curiosity",description:"Turn your notes into a connected, interactive study map."};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
