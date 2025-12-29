import type { Metadata, Viewport } from 'next';

import './globals.css';
import 'sweetalert2/dist/sweetalert2.min.css';

import { getConfig } from '@/lib/config';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { SiteProvider } from '../components/SiteProvider';
import { ThemeProvider } from '../components/ThemeProvider';
import LanguageSelector from '@/components/LanguageSelector';

// 动态生成 metadata，支持配置更新后的标题变化
export async function generateMetadata(): Promise<Metadata> {
  let siteName = process.env.SITE_NAME || 'MoonTV';
  if (process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'd1') {
    const config = await getConfig();
    siteName = config.SiteConfig.SiteName;
  }

  return {
    title: siteName,
    description: "Esmee's Videos",
    manifest: '/manifest.json',
  };
}

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Default to server-side detected locale
  let locale = await getLocale();

  // Optionally fetch user-specific language preference (e.g., from session or DB)
  // Example:
  // const userLang = await getUserLanguagePreference();
  // if (userLang) {
  //   locale = userLang;
  // }
  const messages = await getMessages();

  let siteName = process.env.SITE_NAME || 'MoonTV';
  let announcement =
    process.env.ANNOUNCEMENT ||
    '本網站僅提供影視資訊搜尋服務，所有內容均來自第三方網站。本站不存儲任何影片資源，亦不對任何內容的準確性、合法性或完整性負責。';
  let enableRegister = process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
  let imageProxy = process.env.NEXT_PUBLIC_IMAGE_PROXY || '';
  if (process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'd1') {
    const config = await getConfig();
    siteName = config.SiteConfig.SiteName;
    announcement = config.SiteConfig.Announcement;
    enableRegister = config.UserConfig.AllowRegister;
    imageProxy = config.SiteConfig.ImageProxy;
  }

  // 将运行时配置注入到全局 window 对象，供客户端在运行时读取
  const runtimeConfig = {
    STORAGE_TYPE: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    ENABLE_REGISTER: enableRegister,
    IMAGE_PROXY: imageProxy,
  };

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* 将配置序列化后直接写入脚本，浏览器端可通过 window.RUNTIME_CONFIG 获取 */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig)};`,
          }}
        />
      </head>
      <body className='min-h-screen bg-white text-gray-900 dark:bg-black dark:text-gray-200'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <SiteProvider siteName={siteName} announcement={announcement}>
              {/* Header with language selector */}
              <header className="sticky top-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
                <div className="container mx-auto px-4 py-3 flex justify-end">
                  <div className="flex items-center space-x-4">
                    <LanguageSelector />
                  </div>
                </div>
              </header>
              <main>
                {children}
              </main>
            </SiteProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}