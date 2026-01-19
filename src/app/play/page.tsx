'use client';

import { Suspense } from 'react';

import { PlayPageClient } from '@/app/play/PlayPageClient';

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient />
    </Suspense>
  );
}
