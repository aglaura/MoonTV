import HomePageClient from './page.client';

export const revalidate = 600;
export const dynamic = 'force-static';

export default function Page() {
  return <HomePageClient />;
}
