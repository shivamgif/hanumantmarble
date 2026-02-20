import { getProductBySlug } from "@/lib/products";

export async function generateMetadata({ params }) {
  const product = getProductBySlug(params.slug);

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
