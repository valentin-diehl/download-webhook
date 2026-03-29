import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/OrderStatusBlock.jsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

// Shopify UI Extension custom elements — silence TS2304 in JSX
declare global {
  namespace preact.JSX {
    interface IntrinsicElements {
      [key: `s-${string}`]: Record<string, unknown>;
    }
  }
}
