import './globals.css';
import { Noto_Sans_JP } from 'next/font/google';

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sans-jp',
});

export const metadata = {
  title: 'OpenZeta - Local-First AI Characters',
  description: 'Open-source local-first AI character dialogue application with custom BYOK endpoints.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body className={notoSansJP.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
