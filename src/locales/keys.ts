/**
 * The full set of translation keys the UI uses. Both locale modules
 * (`pt-PT.ts`, `en.ts`) must export a value of exactly this shape —
 * TypeScript fails the build on any missing or misspelled key.
 *
 * Values may contain `{{param}}` placeholders, filled in by `t()`.
 */
export interface TranslationKeys {
  'app.name': string;
  'app.tagline': string;

  'nav.library': string;
  'nav.scan': string;
  'nav.spines': string;
  'nav.add': string;
  'nav.settings': string;
  'nav.beta': string;

  'common.save': string;
  'common.cancel': string;
  'common.delete': string;
  'common.edit': string;
  'common.close': string;
  'common.back': string;
  'common.confirm': string;
  'common.loading': string;
  'common.error': string;
  'common.retry': string;
  'common.yes': string;
  'common.no': string;
  'common.optional': string;
  'common.unknown': string;

  'library.title': string;
  'library.searchPlaceholder': string;
  'library.viewList': string;
  'library.viewGrid': string;
  'library.empty.title': string;
  'library.empty.body': string;
  'library.count': string; // {{count}}
  'library.sort.label': string;
  'library.sort.recentlyAdded': string;
  'library.sort.title': string;
  'library.sort.author': string;
  'library.sort.year': string;
  'library.filter.unverifiedOnly': string;
  'library.filter.readStatus': string;
  'library.filter.shelf': string;
  'library.filter.all': string;
  'library.unverifiedBadge': string;

  'readStatus.unread': string;
  'readStatus.reading': string;
  'readStatus.read': string;
  'readStatus.abandoned': string;

  'book.title': string;
  'book.subtitle': string;
  'book.authors': string;
  'book.authorsHint': string;
  'book.publisher': string;
  'book.publishedYear': string;
  'book.language': string;
  'book.pageCount': string;
  'book.edition': string;
  'book.isbn13': string;
  'book.isbn10': string;
  'book.notes': string;
  'book.tags': string;
  'book.readStatus': string;
  'book.rating': string;
  'book.copyLabel': string;
  'book.copyLabelHint': string;
  'book.acquiredAt': string;
  'book.cover': string;
  'book.coverCapture': string;
  'book.coverRemove': string;
  'book.source': string;
  'book.source.barcode': string;
  'book.source.spine-ocr': string;
  'book.source.manual': string;
  'book.source.import': string;
  'book.metadataSource': string;
  'book.verified': string;
  'book.notVerified': string;
  'book.markVerified': string;
  'book.addedOn': string;
  'book.updatedOn': string;
  'book.deleteConfirm': string;
  'book.deleted': string;
  'book.deletedUndo': string;
  'book.saved': string;
  'book.titleRequired': string;
  'book.notFound': string;

  'entry.title': string;
  'entry.assistSearch': string;
  'entry.assistPlaceholder': string;
  'entry.assistButton': string;
  'entry.assistNoResults': string;
  'entry.assistError': string;
  'entry.assistUseResult': string;
  'entry.manualEntryFrom': string;
  'entry.savedAndAddAnother': string;
  'entry.saveAndAddAnother': string;

  'scan.title': string;
  'scan.startCamera': string;
  'scan.stopCamera': string;
  'scan.cameraDenied': string;
  'scan.uploadInstead': string;
  'scan.uploadLabel': string;
  'scan.torch': string;
  'scan.sessionCount': string; // {{count}}
  'scan.lastScanned': string;
  'scan.invalidBarcode': string;
  'scan.notBookBarcode': string;
  'scan.resolving': string;
  'scan.resolved': string;
  'scan.unresolved': string;
  'scan.unresolvedHint': string;
  'scan.duplicateTitle': string;
  'scan.duplicateBody': string; // {{title}}
  'scan.addCopy': string;
  'scan.skip': string;
  'scan.viewBook': string;
  'scan.addedToLibrary': string;
  'scan.workerError': string;

  'shelf.title': string;
  'shelf.label': string;
  'shelf.name': string;
  'shelf.room': string;
  'shelf.none': string;
  'shelf.add': string;
  'shelf.count': string; // {{count}}
  'shelf.empty.title': string;
  'shelf.empty.body': string;
  'shelf.nameRequired': string;
  'shelf.saved': string;
  'shelf.deleteConfirm': string; // {{name}}
  'shelf.deleted': string;
  'shelf.lastScan': string; // {{date}}
  'shelf.neverScanned': string;
  'shelf.manage': string;

  'spines.title': string;
  'spines.gate.title': string;
  'spines.gate.body': string;
  'spines.gate.accuracy': string;
  'spines.gate.size': string; // {{size}}
  'spines.gate.accept': string;
  'spines.noShelves.title': string;
  'spines.noShelves.body': string;
  'spines.noShelves.create': string;
  'spines.chooseShelf': string;
  'spines.capture': string;
  'spines.recapture': string;
  'spines.notRetained': string;
  'spines.loadingModule': string;
  'spines.running': string; // {{done}} / {{total}}
  'spines.moduleError': string;
  'spines.candidates': string; // {{count}}
  'spines.none.title': string;
  'spines.none.body': string;
  'spines.manualInstead': string;
  'spines.confidence': string; // {{percent}}
  'spines.lowConfidence': string;
  'spines.rawText': string;
  'spines.searching': string;
  'spines.noMatch': string;
  'spines.accept': string;
  'spines.reject': string;
  'spines.accepted': string;
  'spines.rejected': string;
  'spines.finish': string;
  'spines.startOver': string;

  'reconcile.title': string;
  'reconcile.intro': string;
  'reconcile.missing': string;
  'reconcile.missingHint': string;
  'reconcile.unexpected': string;
  'reconcile.unexpectedHint': string;
  'reconcile.reassign': string;
  'reconcile.reassigned': string;
  'reconcile.new': string;
  'reconcile.clean': string;
  'reconcile.done': string;

  'settings.title': string;
  'settings.language': string;
  'settings.language.pt-PT': string;
  'settings.language.en': string;
  'settings.metadataSource': string;
  'settings.metadataSource.openlibrary': string;
  'settings.metadataSource.googlebooks': string;
  'settings.storage': string;
  'settings.storage.usage': string; // {{used}} / {{quota}}
  'settings.storage.unavailable': string;
  'settings.about': string;
  'settings.aboutBody': string;
  'settings.export.title': string;
  'settings.export.body': string;
  'settings.export.button': string;
  'settings.export.lastExport': string; // {{date}}
  'settings.export.never': string;
  'settings.import.title': string;
  'settings.import.body': string;
  'settings.import.button': string;
  'settings.import.mode.merge': string;
  'settings.import.mode.replace': string;
  'settings.import.confirmReplace': string;
  'settings.import.success': string; // {{count}}
  'settings.import.error': string;
  'settings.ocr.title': string;
  'settings.ocr.body': string;
  'settings.ocr.toggle': string;
  'settings.ocr.shelves': string;
}
