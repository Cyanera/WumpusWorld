import DemoMode from '@/components/instructor/DemoMode';
export const dynamic = 'force-dynamic';
export default function Page({ params }: { params: { code: string } }) { return <DemoMode code={params.code.toUpperCase()} />; }
