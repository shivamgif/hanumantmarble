import BrandedLoginPage from '@/components/BrandedLoginPage';
import { cookies } from 'next/headers';

export default async function LoginPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const cookieStore = await cookies();
  const cookieReturnTo = cookieStore.get('hm-login-return-to')?.value;
  const returnTo = resolvedSearchParams?.returnTo || cookieReturnTo || '/';

  return <BrandedLoginPage returnTo={returnTo} />;
}
