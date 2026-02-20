import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect to login explicitly
  redirect('/auth/login');
}
