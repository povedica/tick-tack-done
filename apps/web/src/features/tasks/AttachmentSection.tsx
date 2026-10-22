import { pickDriveFile } from './drive-picker';
import { taskFetch } from './task-http';
import { useQueryClient } from '@tanstack/react-query';
import { runAction } from '../../components/run-action';
import { Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Popover } from '../../components/Popover';
import { Button } from '../../components/ui';
import { useMessages } from '../../i18n';
import { useDriveConnection, rememberDriveReturn } from './use-drive-connection';
import { apiMessage } from './api-message';
import './task-assets.css';
export interface AttachmentItem {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly url: string;
  readonly icon: string | null;
  readonly state: 'ok' | 'missing' | 'unknown';
}
export function AttachmentSection({
  taskId,
  files,
  onFiles,
  onDelete,
}: {
  readonly taskId: string;
  readonly files: readonly AttachmentItem[];
  readonly onFiles: (files: FileList) => void;
  readonly onDelete: (id: string, trash: boolean) => Promise<void>;
}) {
  const messages = useMessages();
  const drive = useDriveConnection();
  const queryClient = useQueryClient();
  const [removal, setRemoval] = useState<AttachmentItem | null>(null);
  const [trash, setTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const hint = drive.reconnect ? messages.driveReconnect : messages.driveRequired;
  const remove = async () => {
    if (!removal || busy) return;
    setBusy(true);
    try {
      await onDelete(removal.id, trash);
      setRemoval(null);
      setError('');
    } catch (caught) {
      setError(apiMessage(caught, messages));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="detail-block task-assets"
      aria-label={messages.attachments}
      data-task-assets={taskId}
    >
      <h3>
        {messages.attachments}
        {files.length ? ` (${String(files.length)})` : ''}
      </h3>
      <p className="asset-help">{messages.driveMetadataOnly}</p>
      <label
        className="detail-attach-btn"
        aria-disabled={!drive.connected}
        title={!drive.connected ? hint : messages.upload}
      >
        <input
          type="file"
          multiple
          disabled={!drive.connected}
          onChange={(event) => {
            if (event.target.files?.length) {
              onFiles(event.target.files);
              event.target.value = '';
            }
          }}
        />
        <Paperclip size={14} aria-hidden="true" />
        {messages.upload}
      </label>
      {drive.connected ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            runAction(
              pickDriveFile()
                .then(async (id) => {
                  if (id) {
                    await taskFetch('POST', `/api/v1/tasks/${taskId}/attachments/drive-link`, {
                      drive_file_id: id,
                    });
                    await queryClient.invalidateQueries({ queryKey: ['attachments', taskId] });
                  }
                })
                .catch((caught: unknown) => {
                  setError(apiMessage(caught, messages));
                }),
            );
          }}
        >
          {messages.drivePicker}
        </Button>
      ) : null}
      {error && !removal ? <p role="alert">{error}</p> : null}
      {!drive.connected ? (
        <p className="asset-connect">
          <span>{hint}</span>
          <Link to="/settings/integrations" onClick={rememberDriveReturn}>
            {drive.reconnect ? messages.driveReconnect : messages.driveConnect}
          </Link>
        </p>
      ) : null}
      <ul className="attachment-chips">
        {files.map((file) => (
          <li key={file.id}>
            <a
              className={`attachment-chip${file.state === 'missing' ? ' is-missing' : ''}`}
              href={file.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              title={file.state === 'missing' ? messages.driveMissing : file.name}
              onPointerEnter={() => {
                if (drive.connected && file.state !== 'missing') setPreview(file);
              }}
              onPointerLeave={() => {
                setPreview(null);
              }}
              onPointerDown={(event) => {
                held.current = false;
                if (event.pointerType === 'touch' && drive.connected)
                  hold.current = setTimeout(() => {
                    held.current = true;
                    setPreview(file);
                  }, 500);
              }}
              onPointerUp={() => {
                if (hold.current) clearTimeout(hold.current);
              }}
              onPointerCancel={() => {
                if (hold.current) clearTimeout(hold.current);
                setPreview(null);
              }}
              onClick={(event) => {
                if (held.current) {
                  event.preventDefault();
                  held.current = false;
                }
              }}
            >
              {file.icon ? (
                <img src={file.icon} alt="" />
              ) : (
                <Paperclip size={14} aria-hidden="true" />
              )}
              <span className="asset-name">{file.name}</span>
              <span className="asset-size">
                {file.size < 1024
                  ? `${String(file.size)} B`
                  : `${String(Math.round(file.size / 1024))} KiB`}
              </span>
            </a>
            <button
              type="button"
              className="asset-remove"
              aria-label={`${messages.driveRemove}: ${file.name}`}
              onClick={() => {
                setRemoval(file);
                setTrash(false);
                setError('');
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {preview ? (
        <div className="asset-preview" role="tooltip">
          <img
            src={`/api/v1/attachments/${preview.id}/preview`}
            alt={messages.drivePreview.replace('{name}', preview.name)}
            onError={() => {
              setPreview(null);
            }}
          />
        </div>
      ) : null}
      {removal ? (
        <div className="ui-scrim">
          <Popover
            open
            label={messages.driveRemove}
            className="ui-modal asset-remove-dialog"
            onClose={() => {
              if (!busy) setRemoval(null);
            }}
          >
            <h2>{messages.driveRemoveQuestion.replace('{name}', removal.name)}</h2>
            <label>
              <input
                type="checkbox"
                checked={trash}
                disabled={busy || !drive.connected}
                onChange={(event) => {
                  setTrash(event.target.checked);
                }}
              />
              {messages.driveTrashAlso}
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <div className="ui-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setRemoval(null);
                }}
              >
                {messages.cancel}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  runAction(remove());
                }}
              >
                {messages.driveRemove}
              </Button>
            </div>
          </Popover>
        </div>
      ) : null}
    </section>
  );
}
