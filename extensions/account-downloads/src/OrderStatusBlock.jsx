import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

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

function anyExpired(downloads) {
  return downloads.some(d => isExpired(d.url));
}

function DownloadSection() {
  const [downloads, setDownloads] = useState(null);
  const [expired, setExpired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const getOrderId = () => {
    const gid = shopify.order?.value?.id;
    return gid ? String(gid).split('/').pop() : null;
  };

  useEffect(() => {
    const id = getOrderId();
    if (!id) return;
    fetchWithRetry(`${WORKER_URL}/downloads?order_id=${id}`, (data) => {
      setDownloads(data);
      setExpired(anyExpired(data));
    });
  }, []);

  // Live expiry check every 10 s — catches expiry while page stays open.
  useEffect(() => {
    if (!downloads?.length || expired) return;
    const interval = setInterval(() => {
      if (anyExpired(downloads)) setExpired(true);
    }, 10_000);
    return () => clearInterval(interval);
  }, [downloads, expired]);

  const handleRefresh = () => {
    const id = getOrderId();
    if (!id) return;
    setRefreshing(true);
    fetchWithRetry(`${WORKER_URL}/downloads?order_id=${id}&refresh=1`, (data) => {
      setDownloads(data);
      setExpired(anyExpired(data));
      setRefreshing(false);
    });
  };

  if (!downloads?.length) return null;

  return (
    <s-banner heading={shopify.i18n.translate('downloads.heading')}>
      <s-stack gap="base">
        {!expired && downloads.map(d => (
          <s-button key={d.url} href={d.url} target="_blank" variant="secondary">
            {shopify.i18n.translate('downloads.button', { name: d.name })}
          </s-button>
        ))}
        {expired && (
          <s-button variant="secondary" onClick={handleRefresh} loading={refreshing}>
            {shopify.i18n.translate('downloads.refresh')}
          </s-button>
        )}
      </s-stack>
    </s-banner>
  );
}

function fetchWithRetry(url, onSuccess, attempts = 0) {
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (data.error === 'Order not found' && attempts < MAX_ATTEMPTS) {
        setTimeout(() => fetchWithRetry(url, onSuccess, attempts + 1), RETRY_DELAY_MS);
        return;
      }
      onSuccess(data.downloads ?? []);
    })
    .catch(() => {
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(() => fetchWithRetry(url, onSuccess, attempts + 1), RETRY_DELAY_MS);
      } else {
        onSuccess([]);
      }
    });
}
