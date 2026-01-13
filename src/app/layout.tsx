import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';

import 'sweetalert2/dist/sweetalert2.min.css';
import './globals.css';

import { getConfig } from '@/lib/config';
import { type Locale,getDefaultLocale, getUserLanguage } from '@/lib/userLanguage';

import { SiteProvider } from '../components/SiteProvider';
import { ThemeProvider } from '../components/ThemeProvider';
import { ServiceWorkerRegistrar } from '../components/ServiceWorkerRegistrar';

type AuthCookiePayload = {
  username?: string;
};

function decodePossiblyDoubleEncoded(value: string): string {
  try {
    let decoded = decodeURIComponent(value);
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }
    return decoded;
  } catch {
    return value;
  }
}

function getUsernameFromAuthCookie(): string | null {
  const raw = cookies().get('auth')?.value;
  if (!raw || raw === 'guest') return null;
  const decoded = decodePossiblyDoubleEncoded(raw);
  try {
    const payload = JSON.parse(decoded) as AuthCookiePayload;
    const uname = payload?.username?.trim();
    return uname && uname.length > 0 ? uname : null;
  } catch {
    return null;
  }
}

async function resolveLocale(): Promise<Locale> {
  const username = getUsernameFromAuthCookie();
  if (username) {
    try {
      return await getUserLanguage(username);
    } catch {
      // ignore
    }
  }
  return getDefaultLocale();
}

const DEFAULT_ANNOUNCEMENTS: Record<Locale, string> = {
  en: 'This site only provides video search information. All content comes from third-party sites. This site does not store any video resources and is not responsible for the accuracy, legality, or completeness of any content.',
  'zh-Hans':
    '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
  'zh-Hant':
    '本網站僅提供影視資訊搜尋服務，所有內容均來自第三方網站。本站不存儲任何影片資源，亦不對任何內容的準確性、合法性或完整性負責。',
};

const DEFAULT_DESCRIPTIONS: Record<Locale, string> = {
  en: "Esmee's Videos",
  'zh-Hans': '影视信息搜索与播放',
  'zh-Hant': '影視資訊搜尋與播放',
};

// 动态生成 metadata，支持配置更新后的标题变化
export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  let siteName = process.env.SITE_NAME || 'Esmee TV';
  if (process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'd1') {
    const config = await getConfig();
    siteName = config.SiteConfig.SiteName;
  }

  return {
    title: siteName,
    description: DEFAULT_DESCRIPTIONS[locale] ?? DEFAULT_DESCRIPTIONS.en,
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
  const locale = await resolveLocale();
  let siteName = process.env.SITE_NAME || 'Esmee TV';
  let announcement =
    DEFAULT_ANNOUNCEMENTS[locale] ?? DEFAULT_ANNOUNCEMENTS.en;
  let enableRegister = process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
  let imageProxy = process.env.NEXT_PUBLIC_IMAGE_PROXY || '';
  if (process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'd1') {
    const config = await getConfig();
    siteName = config.SiteConfig.SiteName;
    // Always prefer hardcoded, locale-aware announcement
    announcement =
      DEFAULT_ANNOUNCEMENTS[locale] ?? DEFAULT_ANNOUNCEMENTS.en;
    enableRegister = config.UserConfig.AllowRegister;
    imageProxy = config.SiteConfig.ImageProxy;
  }

  // 将运行时配置注入到全局 window 对象，供客户端在运行时读取
  const runtimeConfig = {
    STORAGE_TYPE: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    ENABLE_REGISTER: enableRegister,
    IMAGE_PROXY: imageProxy,
    CONFIGJSON:
      process.env.CONFIGJSON ||
      process.env.NEXT_PUBLIC_CONFIGJSON ||
      '',
    MUX_TOKEN: process.env.NEXT_PUBLIC_MUX_TOKEN || '',
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
          <SiteProvider siteName={siteName} announcement={announcement}>
            <main>
              {children}
            </main>
            <ServiceWorkerRegistrar />
          </SiteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
