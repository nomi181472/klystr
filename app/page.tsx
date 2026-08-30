import { redirect } from 'next/navigation';

/**
 * Root route — immediately redirect to the default workspace view.
 * Pure server component, no 'use client'.
 */
export default function RootPage() {
  redirect('/topology');
}
