import type { Metadata } from 'next';

// The admin dashboard never belongs in search results.
export const metadata: Metadata = {
  title: 'Admin – RouteCam',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
