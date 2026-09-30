import { mdiContentCopy, mdiDocker, mdiGithub, mdiClose, mdiLaptop } from '@mdi/js';
import { Icon } from './Icon';
import { toast } from './toast';
import { setApp, useApp } from '../state';

const DEFAULT_REPO = 'https://github.com/AtfastrSlushyMaker/AtlasMesh';
const DEFAULT_IMAGE = 'ghcr.io/atfastrslushymaker/atlasmesh:latest';

function Cmd({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
      <pre
        translate="no"
        style={{ flex: 1, margin: 0, padding: '10px 12px', borderRadius: 'var(--r-control)', background: 'var(--globe-bg)', color: '#dfe6e9', fontSize: 13, overflowX: 'auto', whiteSpace: 'pre' }}
      >
        {text}
      </pre>
      <button className="icon-btn" style={{ height: 'auto', border: '1px solid var(--line)' }} aria-label="Copy command" title="Copy" onClick={() => navigator.clipboard?.writeText(text).then(() => toast('Command copied', 'success'))}>
        <Icon path={mdiContentCopy} size={18} />
      </button>
    </div>
  );
}

/** How to run a full copy. Shown wherever the public demo turns a feature off. */
export function RunLocally({ compact = false }: { compact?: boolean }) {
  const server = useApp((s) => s.server);
  const repo = server?.repoUrl || DEFAULT_REPO;
  const image = server?.image || DEFAULT_IMAGE;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!compact && (
        <p className="muted" style={{ margin: 0 }}>
          This public demo shows the live globe only. On your own computer you get the Intel workspace, your own API keys (ships, 1-minute aircraft, the AI analyst) and investigations saved on your disk. Nothing you look up goes through anyone else’s server.
        </p>
      )}
      <section>
        <h3 className="section-title" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, color: 'var(--text)' }}>
          <Icon path={mdiDocker} size={18} />With Docker (recommended)
        </h3>
        <Cmd text={`docker run -d --name atlasmesh -p 127.0.0.1:3000:3000 \\\n  -v atlasmesh-data:/app/server/data ${image}`} />
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>Then open http://localhost:3000 and add keys under Settings → API keys.</p>
      </section>
      <section>
        <h3 className="section-title" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, color: 'var(--text)' }}>
          <Icon path={mdiLaptop} size={18} />With Node.js 20+
        </h3>
        <Cmd text={`git clone ${repo}.git\ncd AtlasMesh && npm install\nnpm run build && npm start`} />
      </section>
      <a className="btn" href={repo} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
        <Icon path={mdiGithub} size={18} />Open on GitHub
      </a>
    </div>
  );
}

export function RunLocallyDialog() {
  const open = useApp((s) => s.runLocalOpen);
  if (!open) return null;
  const close = () => setApp({ runLocalOpen: false });
  return (
    <div className="overlay" onMouseDown={close}>
      <div className="panel dialog rise" style={{ width: 'min(620px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="run-title" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h2 id="run-title" className="panel-title">Run AtlasMesh yourself</h2>
          <button className="icon-btn" aria-label="Close" onClick={close} autoFocus><Icon path={mdiClose} /></button>
        </div>
        <RunLocally />
      </div>
    </div>
  );
}
