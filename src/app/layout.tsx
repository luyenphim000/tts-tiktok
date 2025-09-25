import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import ReCaptchaProvider from "../components/ReCaptchaProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TikTok TTS Converter",
    template: "%s | TikTok TTS Converter"
  },
  description: "Chuyển đổi văn bản thành giọng nói TikTok chất lượng cao với nhiều giọng đọc tự nhiên. Hỗ trợ định dạng SRT và văn bản thường, dễ dàng tạo audio chuyên nghiệp.",
  keywords: "TikTok TTS, text to speech, giọng nói TikTok, chuyển văn bản thành giọng nói, TTS Việt Nam, SRT to audio",
  authors: [{ name: "TikTok TTS App" }],
  creator: "TikTok TTS Converter",
  openGraph: {
    title: "TikTok TTS Converter - Chuyển văn bản thành giọng nói TikTok",
    description: "Công cụ chuyển đổi văn bản thành giọng nói TikTok miễn phí, hỗ trợ nhiều giọng đọc và định dạng SRT.",
    url: "https://yourdomain.com", // Thay bằng domain thực tế
    siteName: "TikTok TTS Converter",
    images: [
      {
        url: "/logo.png", // Giả sử bạn upload logo.png vào public/
        width: 1200,
        height: 630,
        alt: "TikTok TTS Converter Logo",
      },
    ],
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TikTok TTS Converter",
    description: "Chuyển đổi văn bản thành giọng nói TikTok dễ dàng",
    images: ["/logo.png"], // Giả sử logo.png
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "your-google-verification-code", // Thêm nếu có
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json', // Nếu có PWA manifest
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}`}
          strategy="beforeInteractive"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReCaptchaProvider>
          {children}
        </ReCaptchaProvider>
      </body>
    </html>
  );
}
