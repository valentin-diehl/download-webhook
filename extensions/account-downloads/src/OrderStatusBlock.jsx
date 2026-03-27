import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

const WORKER_URL = 'https://downloads.new-renew.shop';
const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 2500;

export default async () => {
  render(<DownloadSection />, document.body);
};

function DownloadSection() {
  const [downloads, setDownloads] = useState(null);

  useEffect(() => {
    // shopify.order is a reactive signal on customer-account targets
    const orderGid = shopify.order?.value?.id ?? shopify.order?.id;
    if (!orderGid) return;

    const numericId = String(orderGid).split('/').pop();
    fetchWithRetry(`${WORKER_URL}/downloads?order_id=${numericId}`, setDownloads);
  }, []);

  if (!downloads?.length) return null;

  return (
    <s-banner heading={shopify.i18n.translate('downloads.heading')}>
      <s-stack gap="base">
        {downloads.map(d => (
          <s-button key={d.url} href={d.url} target="_blank" variant="secondary">
            {shopify.i18n.translate('downloads.button', { name: d.name })}
          </s-button>
        ))}
      </s-stack>
    </s-banner>
  );
}

function fetchWithRetry(url, setDownloads, attempts = 0) {
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (data.error === 'Order not found' && attempts < MAX_ATTEMPTS) {
        setTimeout(() => fetchWithRetry(url, setDownloads, attempts + 1), RETRY_DELAY_MS);
        return;
      }
      setDownloads(data.downloads ?? []);
    })
    .catch(() => {
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(() => fetchWithRetry(url, setDownloads, attempts + 1), RETRY_DELAY_MS);
      } else {
        setDownloads([]);
      }
    });
}
