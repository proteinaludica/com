export const config = {
  matcher: ['/retomar/:path*'],
};

export function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Match /retomar/<token> and rewrite to /retomar.html
  if (pathname.match(/^\/retomar\/[^/]+$/)) {
    const match = pathname.match(/^\/retomar\/(.+)$/);
    if (match) {
      const token = match[1];
      url.pathname = '/retomar.html';
      url.searchParams.set('token', token);
      return Response.redirect(url, 307);
    }
  }
}
