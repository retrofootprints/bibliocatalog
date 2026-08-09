import { useEffect, useState } from 'preact/hooks';
import { getCover } from '../db/queries';

export interface CoverImageProps {
  coverBlobId?: string;
  coverUrl?: string;
  alt: string;
  class?: string;
}

/** Renders a book cover from local blob storage (preferred) or a remote URL fallback. */
export function CoverImage({ coverBlobId, coverUrl, alt, class: className }: CoverImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let revoke: string | undefined;
    let cancelled = false;
    if (coverBlobId) {
      getCover(coverBlobId).then((cover) => {
        if (cancelled || !cover) return;
        const url = URL.createObjectURL(cover.blob);
        revoke = url;
        setObjectUrl(url);
      });
    }
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [coverBlobId]);

  const src = objectUrl ?? coverUrl;

  if (!src) {
    return (
      <div class={`cover cover--placeholder ${className ?? ''}`} aria-hidden="true">
        <span>{alt.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  return <img class={`cover ${className ?? ''}`} src={src} alt={alt} loading="lazy" />;
}
