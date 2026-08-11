import { useEffect, useState } from 'preact/hooks';
import type { Book } from '../../db/types';
import { BookForm, type BookFormValues } from '../../intake/manual/BookForm';
import type { SpineCandidate } from '../../intake/ocr/types';
import { LOW_CONFIDENCE } from '../../intake/ocr/types';
import { t } from '../../locales';
import type { ResolvedMetadata } from '../../metadata/types';
import { CoverImage } from '../../ui/CoverImage';

export type CandidateStatus = 'searching' | 'match' | 'existing' | 'nomatch' | 'accepted' | 'rejected';

export interface ReviewItem {
  candidate: SpineCandidate;
  status: CandidateStatus;
  /** Proposed metadata match, when the provider returned one. */
  match?: ResolvedMetadata;
  /** The candidate turned out to be a book already in the library. */
  existing?: Book;
  /** Set once accepted: the record this candidate resolved to. */
  resultBook?: Book;
  editing?: boolean;
}

export interface SpineCandidateCardProps {
  item: ReviewItem;
  /** Show the preprocessed image OCR consumed instead of the colour crop. */
  showProcessed: boolean;
  onAccept: () => void;
  onReject: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (values: BookFormValues) => Promise<void>;
}

/** Display-only view of the cropped spine. The blob is never persisted (SPEC §12.2)
 *  and its object URL is revoked as soon as the card unmounts. */
function SpineCrop({ crop, alt }: { crop: Blob; alt: string }) {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(crop);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [crop]);

  if (!url) return <div class="spine-card__crop spine-card__crop--empty" aria-hidden="true" />;
  return <img class="spine-card__crop" src={url} alt={alt} />;
}

function initialFromItem(item: ReviewItem): Partial<Book> {
  const match = item.match;
  if (!match) return { title: item.candidate.rawText };
  return {
    title: match.title,
    subtitle: match.subtitle,
    authors: match.authors,
    publisher: match.publisher,
    publishedYear: match.publishedYear,
    language: match.language,
    pageCount: match.pageCount,
    isbn13: match.isbn13,
    coverUrl: match.coverUrl,
  };
}

export function SpineCandidateCard({
  item,
  showProcessed,
  onAccept,
  onReject,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
}: SpineCandidateCardProps) {
  const { candidate, status } = item;
  const lowConfidence = candidate.confidence <= LOW_CONFIDENCE;
  const resolved = status === 'accepted' || status === 'rejected';

  if (item.editing) {
    return (
      <li class="spine-card spine-card--editing">
        <BookForm
          initial={initialFromItem(item)}
          submitLabel={t('common.save')}
          onSubmit={onSubmitEdit}
          onCancel={onCancelEdit}
          showAssist
        />
      </li>
    );
  }

  return (
    <li class={`spine-card spine-card--${status}`}>
      <SpineCrop crop={showProcessed ? candidate.debugCrop : candidate.crop} alt={candidate.rawText} />

      <div class="spine-card__body">
        <p class="spine-card__raw">
          <span class="spine-card__raw-label">{t('spines.rawText')}:</span> {candidate.rawText}
        </p>

        <div class="spine-card__badges">
          <span class={`badge ${lowConfidence ? 'badge--warn' : ''}`}>
            {t('spines.confidence', { percent: Math.round(candidate.confidence * 100) })}
          </span>
          {lowConfidence && !resolved && <span class="badge badge--warn">{t('spines.lowConfidence')}</span>}
          {status === 'existing' && <span class="badge badge--ok">{t('scan.duplicateTitle')}</span>}
          {status === 'accepted' && <span class="badge badge--ok">{t('spines.accepted')}</span>}
          {status === 'rejected' && <span class="badge">{t('spines.rejected')}</span>}
        </div>

        {status === 'searching' && <p class="spine-card__status">{t('spines.searching')}</p>}
        {status === 'nomatch' && <p class="spine-card__status">{t('spines.noMatch')}</p>}

        {(item.match || item.existing) && (
          <div class="spine-card__match">
            <CoverImage
              coverBlobId={item.existing?.coverBlobId}
              coverUrl={item.existing?.coverUrl ?? item.match?.coverUrl}
              alt={item.existing?.title ?? item.match?.title ?? ''}
              class="spine-card__match-cover"
            />
            <div>
              <p class="spine-card__match-title">{item.existing?.title ?? item.match?.title}</p>
              <p class="spine-card__match-authors">
                {(item.existing?.authors ?? item.match?.authors ?? []).join(', ')}
                {item.match?.publishedYear ? ` (${item.match.publishedYear})` : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {!resolved && status !== 'searching' && (
        <div class="spine-card__actions">
          <button type="button" class="btn btn--small btn--primary" onClick={onAccept} disabled={status === 'nomatch'}>
            {t('spines.accept')}
          </button>
          <button type="button" class="btn btn--small" onClick={onStartEdit}>
            {t('common.edit')}
          </button>
          <button type="button" class="btn btn--small btn--text" onClick={onReject}>
            {t('spines.reject')}
          </button>
        </div>
      )}

      {status === 'accepted' && item.resultBook && (
        <div class="spine-card__actions">
          <a class="btn btn--small" href={`#/book/${item.resultBook.id}`}>
            {t('scan.viewBook')}
          </a>
        </div>
      )}
    </li>
  );
}
