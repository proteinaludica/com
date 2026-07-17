export function middleware(request) {
  const { pathname } = new URL(request.url);

  // Match /retomar/<token> paths and rewrite to /retomar.html with token query parameter
  const match = pathname.match(/^\/retomar\/([^/]+)$/);
  if (match) {
    const token = match[1];
    const url = new URL(request.url);
    url.pathname = '/retomar.html';
    url.searchParams.set('token', token);
    return new Response(null, {
      status: 307,
      headers: {
        location: url.toString(),
      },
    });
  }

  return null;
}
