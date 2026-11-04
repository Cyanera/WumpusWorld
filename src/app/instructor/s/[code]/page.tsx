import Dashboard from '@/components/instructor/Dashboard';
export const dynamic = 'force-dynamic';
export default function Page({ params }: { params: { code: string } }) { return <Dashboard code={params.code.toUpperCase()} />; }
