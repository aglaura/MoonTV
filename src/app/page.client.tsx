'use client';

import { Suspense } from 'react';

import HomeClient from './(home)/HomeClient';

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
