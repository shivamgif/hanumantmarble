import { getAllProducts, getProductBySlug } from "@/lib/products";

// Built at deploy time: the catalogue is a bundled JSON file. Unknown slugs
// still render on demand (dynamicParams defaults to true).
export function generateStaticParams() {
  return getAllProducts().map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }) {
  // A Promise since Next 15; reading .slug off it gave undefined, so every
  // product page was titled "Product Not Found".
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    return {
      title: "Product Not Found",
      description: "The product you are looking for could not be found.",
    };
  }

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: `${product.name} – Hanumant Marble`,
      description: product.description,
      images: [
        {
          url: product.mainImage,
          alt: product.name,
        },
      ],
    },
  };
}

export default function ProductLayout({ children }) {
  return children;
}
