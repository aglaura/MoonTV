'use client';

import { Suspense } from 'react';

import { PlayPageClient } from '@/app/play/page';

export default function TvPlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient variant='tv' />
    </Suspense>
  );
}
