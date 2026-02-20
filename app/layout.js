import "./globals.css";

export const metadata = {
  title: "Act Fairly | A Complete Database of RTB Disputes in Ireland",
  description: "A complete, searchable database of every dispute filed with the Residential Tenancies Board (RTB) in Ireland. Search by name, address, dispute type. Identify repeat offenders with our league table.",
  keywords: "RTB, disputes, Ireland, landlord, tenant, residential tenancies board, adjudication, tribunal, Act Fairly",
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
