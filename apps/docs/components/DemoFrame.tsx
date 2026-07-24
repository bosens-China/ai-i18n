import { demoDevUrl, demoProdUrl, type DemoFramework } from './demo-urls';

interface DemoFrameProps {
  framework: DemoFramework;
  title: string;
  description: string;
}

/** 嵌入独立 Vite example；dev 指向本地端口，生产指向同域静态产物。 */
export default function DemoFrame({
  framework,
  title,
  description,
}: DemoFrameProps) {
  const href = import.meta.env.DEV
    ? demoDevUrl(framework)
    : demoProdUrl(framework, import.meta.env.BASE_URL);

  return (
    <section style={{ marginBlock: '1.5rem' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '0.75rem',
        }}
      >
        <div>
          <h2 id={framework} style={{ margin: 0, fontSize: '1.25rem' }}>
            {title}
          </h2>
          <p style={{ margin: '0.35rem 0 0', opacity: 0.8 }}>{description}</p>
        </div>
        <a href={href} target="_blank" rel="noreferrer">
          单独打开 ↗
        </a>
      </header>
      <iframe
        src={href}
        title={title}
        loading="lazy"
        style={{
          display: 'block',
          width: '100%',
          height: '22rem',
          border: '1px solid var(--rp-c-divider)',
          borderRadius: '0.5rem',
        }}
      />
    </section>
  );
}
