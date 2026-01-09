import DoubanPageClient from './page.client';

export const revalidate = 600;
export const dynamic = 'force-static';

export default function DoubanPage() {
  return <DoubanPageClient />;
}
