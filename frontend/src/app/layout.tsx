import type { Metadata, Viewport } from 'next';
import { Prompt } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthStateListener } from '@/components/AuthStateListener';
import { FloatingContactButton } from '@/components/FloatingContactButton';

const prompt = Prompt({
  subsets: ['latin', 'thai'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-prompt',
});

export const metadata: Metadata = {
  title: {
    default: 'dooslip.com | ระบบตรวจสอบสลิปอัตโนมัติ แม่นยำ 100%',
    template: '%s | dooslip.com',
  },
  description: 'dooslip.com ระบบตรวจสอบสลิปธนาคารอัตโนมัติ แม่นยำ 100% รองรับทุกธนาคารชั้นนำในไทย พร้อมระบบจัดการ LINE OA และการชำระเงินด้วย USDT (Crypto)',
  keywords: ['dooslip', 'ตรวจสอบสลิป', 'Slip Verification API', 'USDT', 'Crypto Payment', 'LINE OA', 'จัดการสลิป'],
  authors: [{ name: 'dooslip.com Team' }],
  robots: 'index, follow',
  openGraph: {
    title: 'dooslip.com | ระบบตรวจสอบสลิปอัตโนมัติ',
    description: 'ตรวจสอบสลิปธนาคารอัตโนมัติ แม่นยำ 100% พร้อมรองรับ USDT',
    type: 'website',
    locale: 'th_TH',
    siteName: 'dooslip.com',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#22c55e',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={prompt.variable}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className={`${prompt.className} min-h-screen bg-slate-50 font-sans antialiased`}>
        <ErrorBoundary>
          <Providers>
            <ToastProvider>
              <AuthStateListener />
              {children}
              <FloatingContactButton />
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#fff',
                    color: '#374151',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
                    padding: '12px 16px',
                    fontFamily: 'var(--font-prompt)',
                  },
                  success: {
                    iconTheme: {
                      primary: '#22c55e',
                      secondary: '#fff',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#ef4444',
                      secondary: '#fff',
                    },
                    duration: 6000,
                  },
                }}
              />
            </ToastProvider>
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
