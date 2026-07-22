import type { RecentBook } from '../types';

interface HomeProps {
  books: RecentBook[];
  onOpenDialog: () => void;
  onOpenFolder: () => void;
  onOpenBook: (book: RecentBook) => void;
  onRemove: (book: RecentBook) => void;
}

export function Home({
  books,
  onOpenDialog,
  onOpenFolder,
  onOpenBook,
  onRemove,
}: HomeProps) {
  return (
    <div className="home">
      <div className="home-hero">
        <h1>All Book Reader</h1>
        <p>
          Open TXT, PDF, EPUB, or ZIP/CBZ comics (or an image folder). Your place and recent books
          are saved automatically.
        </p>
      </div>

      <div className="home-actions">
        <button type="button" onClick={onOpenDialog}>
          Open Book…
        </button>
        <button type="button" onClick={onOpenFolder}>
          Open Folder…
        </button>
      </div>

      <div className="drop-hint">Open a file or drop a book, ZIP/CBZ, or folder here.</div>

      {books.length > 0 && (
        <div className="book-list">
          {books.map((book) => (
            <div
              key={book.id}
              className={`book-row${book.missing ? ' missing' : ''}`}
              onClick={() => {
                if (!book.missing) onOpenBook(book);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !book.missing) onOpenBook(book);
              }}
              role="button"
              tabIndex={0}
            >
              <div>
                <h3>
                  {book.title}
                  {book.missing && <span className="badge">Missing</span>}
                </h3>
                <div className="book-meta">
                  {book.path}
                  <br />
                  Page {book.lastPage}
                  {book.totalPages ? ` / ${book.totalPages}` : ''} · {book.format.toUpperCase()}
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(book);
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
