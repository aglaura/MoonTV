import { Suspense } from 'react';

import AdminPageClient from './AdminPageClient';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageClient />
    </Suspense>
  );
}
