import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

const WORKER_URL = 'https://nr-shop-download-worker.newrenew-shop.workers.dev';

export default async () => {
  render(<DownloadSection />, document.body);
};

function DownloadSection() {
  const [downloads, setDownloads] = useState(null);

  useEffect(() => {
    const orderGid = shopify.orderConfirmation?.value?.order?.id;
    if (!orderGid) return;
    const numericId = orderGid.split('/').pop();
    const url = `${WORKER_URL}/downloads?order_id=${numericId}`;

    let attempts = 0;
    const MAX_ATTEMPTS = 6;
    const RETRY_DELAY_MS = 2500;

    const attempt = () => {
      attempts++;
      fetch(url)
        .then(r => r.json())
        .then(data => {
          if (data.error === 'Order not found' && attempts < MAX_ATTEMPTS) {
            setTimeout(attempt, RETRY_DELAY_MS);
            return;
          }
          setDownloads(data.downloads ?? []);
        })
        .catch(() => {
          if (attempts < MAX_ATTEMPTS) setTimeout(attempt, RETRY_DELAY_MS);
          else setDownloads([]);
        });
    };

    attempt();
  }, []);

  if (!downloads || downloads.length === 0) return null;

  return (
    <s-banner heading="Deine Downloads">
      <s-stack gap="base">
        {downloads.map(d => (
          <s-button key={d.url} href={d.url} target="_blank" variant="secondary">
            {d.name} herunterladen
          </s-button>
        ))}
      </s-stack>
    </s-banner>
  );
}