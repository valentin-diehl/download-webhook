import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';

const WORKER_URL = 'https://downloads.new-renew.shop';
const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 2500;

export default async () => {
  render(<DownloadSection />, document.body);
};

// Handles both old {downloads:[]} and new {products:[]} worker response formats.
function normaliseResponse(data) {
  if (data.products) return data.products;
  if (data.downloads) {
    const map = new Map();
    for (const d of data.downloads) {
      if (!map.has(d.name)) map.set(d.name, { title: d.name, image: null, files: [] });
      map.get(d.name).files.push({ filename: d.filename ?? d.name, url: d.url });
    }
    return [...map.values()];
  }
  return [];
}

function DownloadSection() {
  const [products, setProducts] = useState(null);

  useEffect(() => {
    const orderGid = shopify.orderConfirmation?.value?.order?.id;
    if (!orderGid) return;

    const numericId = orderGid.split('/').pop();
    if (!/^\d+$/.test(numericId)) return;
    fetchWithRetry(`${WORKER_URL}/downloads?order_id=${numericId}`, setProducts);
  }, []);

  const allUrls = useMemo(
    () => (products ?? []).flatMap(p => p.files.map(f => f.url)),
    [products],
  );

  // Stagger opens to avoid popup-blockers dropping concurrent window.open calls.
  const downloadAll = useCallback(() => {
    allUrls.forEach((url, i) => {
      setTimeout(() => window.open(url, '_blank'), i * 300);
    });
  }, [allUrls]);

  if (!products?.length) return null;

  const translate = shopify.i18n.translate;

  return (
    <s-stack direction="block" gap="base">
      <s-heading level="1">{translate('downloads.heading')}</s-heading>

      <s-stack direction="block" gap="small-200">
        {products.map((product, i) => (
          <s-box key={i} borderRadius="large-100" borderWidth="base" padding="base" background="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              {product.image && (
                <s-product-thumbnail src={product.image} alt={product.title} size="base" />
              )}
              <s-stack direction="block" gap="small-500">
                <s-text type="strong">{product.title}</s-text>
                <s-stack direction="block" gap="small-500">
                  {product.files.map((file, j) => (
                    <s-link key={j} href={file.url} target="_blank" tone="auto">
                      <s-stack direction="inline" gap="small-300" alignItems="center">
                        <s-box borderRadius="max" borderWidth="base" padding="small-400">
                          <s-icon type="arrow-down" size="small-200" tone="auto" />
                        </s-box>
                        {file.filename}
                      </s-stack>
                    </s-link>
                  ))}
                </s-stack>
              </s-stack>
            </s-stack>
          </s-box>
        ))}
      </s-stack>

      {allUrls.length > 1 && (
        <s-button variant="primary" onClick={downloadAll} inlineSize="fill">
          {translate('downloads.download_all')}
        </s-button>
      )}
    </s-stack>
  );
}

function fetchWithRetry(url, onSuccess, attempts = 0) {
  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(data => {
      if (data.error === 'Order not found' && attempts < MAX_ATTEMPTS) {
        setTimeout(() => fetchWithRetry(url, onSuccess, attempts + 1), RETRY_DELAY_MS);
        return;
      }
      onSuccess(normaliseResponse(data));
    })
    .catch(() => {
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(() => fetchWithRetry(url, onSuccess, attempts + 1), RETRY_DELAY_MS);
      } else {
        onSuccess([]);
      }
    });
}