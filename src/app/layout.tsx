import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Wumpus World — Think Like an AI Agent', description: 'Real-time classroom activity for Knowledge-Based Agents' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, themeColor: '#0b0a12' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('ww-theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}" }} /></head>
      <body className="min-h-screen antialiased">{children}</body></html>);
}
