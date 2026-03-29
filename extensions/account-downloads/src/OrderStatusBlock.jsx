import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';

const WORKER_URL = 'https://downloads.new-renew.shop';
const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 2500;

export default async () => {
  render(<DownloadSection />, document.body);
};

// Decode expiry from the token payload (no signature check — that happens server-side on download).
function isExpired(url) {
  try {
    const token = new URL(url).searchParams.get('token');
    if (!token) return true;
    const json = atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json);
    return typeof exp !== 'number' || exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}

// Handles both old {downloads:[]} and new {products:[]} worker response formats.
function normaliseResponse(data) {
  let products;
  if (data.products) {
    products = data.products;
  } else if (data.downloads) {
    const map = new Map();
    for (const d of data.downloads) {
      if (!map.has(d.name)) map.set(d.name, { title: d.name, image: null, files: [] });
      map.get(d.name).files.push({ filename: d.filename ?? d.name, url: d.url });
    }
    products = [...map.values()];
  } else {
    products = [];
  }
  return { products, license: data.license || null, invoice: data.invoice || null };
}

function anyExpired(products, license) {
  const filesExpired = products.some(p => p.files.some(f => isExpired(f.url)));
  const licenseExpired = license ? isExpired(license) : false;
  return filesExpired || licenseExpired;
}

function getOrderId() {
  const gid = shopify.order?.value?.id;
  if (!gid) return null;
  const id = String(gid).split('/').pop();
  return /^\d+$/.test(id) ? id : null;
}

function DownloadSection() {
  const [products, setProducts] = useState(null);
  const [expired, setExpired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [license, setLicense] = useState(null);
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    const id = getOrderId();
    if (!id) return;
    fetchWithRetry(`${WORKER_URL}/downloads?order_id=${id}`, (result) => {
      setProducts(result.products);
      setLicense(result.license);
      setInvoice(result.invoice);
      setExpired(anyExpired(result.products, result.license));
    });
  }, []);

  // Catches expiry while the page stays open.
  useEffect(() => {
    if (!products?.length || expired) return;
    const interval = setInterval(() => {
      if (anyExpired(products, license)) setExpired(true);
    }, 10_000);
    return () => clearInterval(interval);
  }, [products, expired]);

  const handleRefresh = useCallback(() => {
    const id = getOrderId();
    if (!id) return;
    setRefreshing(true);
    fetchWithRetry(`${WORKER_URL}/downloads?order_id=${id}&refresh=1`, (result) => {
      if (result.products.length) {
        setProducts(result.products);
        setLicense(result.license);
        setInvoice(result.invoice);
        setExpired(anyExpired(result.products, result.license));
      }
      setRefreshing(false);
    });
  }, []);

  const allUrls = useMemo(() => {
    return (products ?? []).flatMap(p => p.files.map(f => f.url));
  }, [products]);

  // Stagger opens to avoid popup-blockers dropping concurrent window.open calls.
  const downloadAll = useCallback(() => {
    allUrls.forEach((url, i) => {
      setTimeout(() => window.open(url, '_blank'), i * 300);
    });
  }, [allUrls]);

  if (!products?.length) return null;

  const translate = shopify.i18n.translate;
  const heading = expired
    ? translate('downloads.heading_expired')
    : translate('downloads.heading');

  return (
    <s-stack direction="block" gap="base">
      <s-heading>{heading}</s-heading>

      {!expired && (
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
      )}

      {expired && (
        <s-button variant="primary" onClick={handleRefresh} loading={refreshing} inlineSize="fill">
          {translate('downloads.refresh')}
        </s-button>
      )}

      {!expired && (
        <s-stack direction="block" gap="small-300">
          {allUrls.length > 1 && (
            <s-button variant="primary" onClick={downloadAll} inlineSize="fill">
              {translate('downloads.download_all')}
            </s-button>
          )}
          <s-grid gridTemplateColumns="1fr 1fr" gap="small-300">
            {license && (
              <s-button variant="secondary" onClick={() => window.open(license, '_blank')} inlineSize="fill">
                {translate('downloads.download_license')}
              </s-button>
            )}
            {invoice && (
              <s-button variant="secondary" onClick={() => window.open(invoice, '_blank')} inlineSize="fill">
                {translate('downloads.download_invoice')}
              </s-button>
            )}
          </s-grid>
        </s-stack>
      )}
    </s-stack>
  );
}

function fetchWithRetry(url, onSuccess, attempts = 0) {
  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(String(r.status));
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
        onSuccess({ products: [], license: null });
      }
    });
}
