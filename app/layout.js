import "./globals.css";

export const metadata = {
  title: "Act Fairly | Ireland Property Intelligence",
  description: "Ireland's most comprehensive property data platform. Search RTB disputes, enforcement orders, and rent register comparables nationwide.",
  keywords: "RTB, disputes, Ireland, landlord, tenant, residential tenancies board, rent register, comparables, Act Fairly",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0a0f" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
