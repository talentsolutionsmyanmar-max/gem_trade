import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QuentrexKillzone OS v8.0',
  description: 'ICT/SMC Trading System with Risk Management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white">{children}</body>
    </html>
  );
}