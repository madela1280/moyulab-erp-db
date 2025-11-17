'use client';
import dynamic from 'next/dynamic';

const Home = dynamic(() => import('./Home'), { ssr: false });

export default function Page() {
  return (
    <>
      <div style={{ color: 'red', fontWeight: 'bold', padding: '4px' }}>
        build-test-v1
      </div>
      <Home />
    </>
  );
}

