import { useCallback, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
}

const ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
};

export default function MediaDropzone({ files, onChange, maxFiles = 10 }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      onChange([...files, ...accepted].slice(0, maxFiles));
    },
    [files, onChange, maxFiles],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles,
    maxSize: 50 * 1024 * 1024,
  });

  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const removeAt = (idx: number) => onChange(files.filter((_, i) => i !== idx));

  return (
    <div>
      <div
        {...getRootProps()}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40',
        )}
      >
        <input {...getInputProps()} />
        <svg className="h-9 w-9 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9m0 0 3.75 3.75M12 9l-3.75 3.75M21 16.5v2.25A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V16.5" />
        </svg>
        <p className="text-sm font-medium text-slate-700">
          {isDragActive ? 'Drop photos or videos here' : 'Drag & drop photos or videos, or click to browse'}
        </p>
        <p className="text-xs text-slate-400">JPEG, PNG, WebP, HEIC, MP4, MOV or WebM · up to {maxFiles} files · max 50MB each</p>
      </div>

      {fileRejections.length > 0 && (
        <p className="mt-2 text-xs text-red-600">
          {fileRejections[0].file.name}: {fileRejections[0].errors[0]?.message}
        </p>
      )}

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {previews.map(({ file, url }, idx) => (
            <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100">
              {file.type.startsWith('video/') ? (
                <video src={url} className="h-full w-full object-cover" muted />
              ) : (
                <img src={url} alt={file.name} className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
