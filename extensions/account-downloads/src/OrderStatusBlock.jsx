import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

const WORKER_URL = 'https://nr-shop-download-worker.newrenew-shop.workers.dev';

export default async () => {
  render(<DownloadSection />, document.body);
};

function DownloadSection() {
  const [downloads, setDownloads] = useState(null);
  const [debug, setDebug] = useState('init');

  useEffect(() => {
    const keys = Object.keys(shopify ?? {}).join(', ');
    const orderGid = shopify.order?.current?.id ?? shopify.order?.value?.id ?? shopify.order?.id;
    setDebug(`keys: ${keys} | gid: ${orderGid} | order type: ${typeof shopify.order} | order keys: ${Object.keys(shopify.order ?? {}).join(', ')}`);
    if (!orderGid) return;
    const numericId = String(orderGid).split('/').pop();
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

  if (!downloads || downloads.length === 0) return <s-banner heading="Account Downloads Debug"><s-text>{debug}</s-text></s-banner>;

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
