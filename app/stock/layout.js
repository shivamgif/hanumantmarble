import StockShell from './stock-shell';
import { PRODUCT_NAME } from '@/lib/product';

// Server layout so /stock gets the product's tab title, not the storefront's.
export const metadata = { title: { absolute: PRODUCT_NAME, template: `%s | ${PRODUCT_NAME}` } };

export default function StockLayout({ children }) {
  return <StockShell>{children}</StockShell>;
}
