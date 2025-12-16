export const runtime = 'nodejs';

export async function GET() {
	return new Response('Auth routes are handled by middleware', { status: 404 });
}

export async function POST() {
	return new Response('Auth routes are handled by middleware', { status: 404 });
}
