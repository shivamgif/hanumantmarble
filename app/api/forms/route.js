export async function GET() {
  // This endpoint allows Netlify to discover forms
  return new Response(`
    <form name="product-quote" netlify>
      <input type="text" name="fullname" />
      <input type="email" name="email" />
      <input type="tel" name="mobile" />
      <select name="brand"></select>
      <input type="text" name="product" />
      <input type="text" name="quantity" />
    </form>
  `, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
