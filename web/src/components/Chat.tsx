import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorText } from '../lib/api';
import { useApi, useInterval } from '../lib/hooks';
import { dt } from '../lib/format';
import { Button, ErrorBox, Loading, PrivateImage, Textarea, useToast } from './ui';

/** Conversación privada paciente-profesional. Se actualiza cada 15 s mientras está abierta. */
export function Chat({ url, extract, emptyText }: { url: string; extract?: (d: any) => any[]; emptyText: string }) {
  const { data, error, loading, reload } = useApi<any>(url);
  useInterval(reload, 15000);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const msgs: any[] = data ? (extract ? extract(data) : data) : [];
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length]);
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('body', text);
      if (file) fd.append('file', file);
      await api.post(url, fd);
      setText(''); // solo se limpia si el servidor confirmó el envío
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await reload();
    } catch (err) {
      toast(`No se envió el mensaje: ${errorText(err)}`, 'danger');
    } finally {
      setBusy(false);
    }
  }
  if (loading && !data) return <Loading />;
  return (
    <div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="chat" aria-live="polite">
        {msgs.length ? (
          msgs.map((m) => (
            <div key={m.id} className={`bubble ${m.mine ? 'mine' : ''}`}>
              {m.body}
              {m.file_url ? <PrivateImage src={m.file_url} alt="Imagen adjunta" /> : null}
              <div className="meta">
                {m.mine ? 'Vos' : m.sender_name} · {dt(m.created_at)}
                {m.mine ? (m.read_at ? ' · Leído' : ' · Enviado') : ''}
              </div>
            </div>
          ))
        ) : (
          <p className="muted">{emptyText}</p>
        )}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={send}>
        <Textarea aria-label="Escribí tu mensaje" placeholder="Escribí tu mensaje" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={2} />
        <div className="stack" style={{ gap: '0.3rem' }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            {file ? '1 imagen' : 'Imagen'}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button type="submit" busy={busy} className="btn-sm">Enviar</Button>
        </div>
      </form>
    </div>
  );
}
