import StudentApp from '@/components/game/StudentApp';
export const dynamic = 'force-dynamic';
export default function Page({ params }: { params: { code: string } }) { return <StudentApp code={params.code.toUpperCase()} />; }
