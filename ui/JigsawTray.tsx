// Scrollable tray for unplaced jigsaw pieces (spec 9): right-hand sidebar in
// landscape, horizontal bottom strip in portrait, with an All / Edges filter.
import { memo, useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { coverRect, isEdgePiece, trayPieces, type Piece, type TrayFilter } from '../jigsaw';
import { drawPieceThumb, type Picture } from './jigsawDraw';

interface Props {
  trayRef: RefObject<HTMLDivElement | null>;
  pieces: Piece[];
  picture: Picture;
  pictureRect: ReturnType<typeof coverRect>;
  showOutlines: boolean;
  filter: TrayFilter;
  onFilter: (filter: TrayFilter) => void;
  isPortrait: boolean;
  dropHighlight: boolean;
  onStartFromTray: (id: number, e: PointerEvent<HTMLButtonElement>) => void;
}

const THUMB_SIZE = 64;

interface ThumbProps {
  piece: Piece;
  picture: Picture;
  pictureRect: ReturnType<typeof coverRect>;
  showOutlines: boolean;
  onStart: (id: number, e: PointerEvent<HTMLButtonElement>) => void;
}

const PieceThumb = memo(({ piece, picture, pictureRect, showOutlines, onStart }: ThumbProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const px = Math.round(THUMB_SIZE * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPieceThumb(ctx, piece, picture, pictureRect, THUMB_SIZE, showOutlines);
  }, [piece, picture, pictureRect, showOutlines]);

  return (
    <button
      type="button"
      onPointerDown={e => onStart(piece.id, e)}
      aria-label={`Piece ${piece.id + 1}${isEdgePiece(piece) ? ' (edge)' : ''}`}
      className="shrink-0 w-16 h-16 rounded-md bg-slate-100 hover:bg-white shadow-sm hover:ring-2 hover:ring-sky-400 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
    >
      <canvas ref={canvasRef} className="w-16 h-16 pointer-events-none" />
    </button>
  );
});

const FilterPills = ({
  filter,
  onFilter,
  allCount,
  edgeCount
}: {
  filter: TrayFilter;
  onFilter: (f: TrayFilter) => void;
  allCount: number;
  edgeCount: number;
}) => (
  <div className="flex rounded-md bg-slate-900/70 p-0.5 text-xs" role="group" aria-label="Tray filter">
    {(
      [
        ['all', `All (${allCount})`],
        ['edges', `Edges (${edgeCount})`]
      ] as const
    ).map(([key, label]) => (
      <button
        key={key}
        type="button"
        aria-pressed={filter === key}
        onClick={() => onFilter(key)}
        className={`px-2 py-0.5 rounded font-semibold whitespace-nowrap ${
          filter === key ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

export const JigsawTray = ({
  trayRef,
  pieces,
  picture,
  pictureRect,
  showOutlines,
  filter,
  onFilter,
  isPortrait,
  dropHighlight,
  onStartFromTray
}: Props) => {
  const allInTray = trayPieces(pieces, 'all');
  const edgesInTray = trayPieces(pieces, 'edges');
  const shown = filter === 'edges' ? edgesInTray : allInTray;

  const containerClass = isPortrait
    ? 'h-28 shrink-0 border-t border-slate-700/70 flex flex-col'
    : 'w-40 lg:w-44 shrink-0 border-l border-slate-700/70 flex flex-col';

  const listClass = isPortrait
    ? 'flex-1 min-h-0 flex flex-row items-center gap-1.5 px-2 py-1 overflow-x-auto overflow-y-hidden'
    : 'flex-1 min-h-0 grid grid-cols-2 content-start justify-items-center gap-1.5 p-1.5 overflow-y-auto overflow-x-hidden';

  return (
    <aside
      ref={trayRef}
      aria-label="Piece tray"
      className={`${containerClass} ${
        dropHighlight ? 'bg-slate-800 ring-2 ring-inset ring-sky-400' : 'bg-slate-800/90'
      }`}
    >
      <div className="px-2 py-1 border-b border-slate-700/60 flex items-center justify-between gap-1 shrink-0">
        {dropHighlight ? (
          <span className="text-xs font-semibold text-sky-300">Drop to return to tray</span>
        ) : (
          <FilterPills filter={filter} onFilter={onFilter} allCount={allInTray.length} edgeCount={edgesInTray.length} />
        )}
      </div>

      <div className={listClass}>
        {shown.length > 0 ? (
          shown.map(p => (
            <PieceThumb
              key={p.id}
              piece={p}
              picture={picture}
              pictureRect={pictureRect}
              showOutlines={showOutlines}
              onStart={onStartFromTray}
            />
          ))
        ) : (
          <div className="col-span-2 text-xs text-slate-400 text-center py-2 px-1">
            {allInTray.length === 0 ? (
              'All pieces on board'
            ) : (
              <button type="button" onClick={() => onFilter('all')} className="text-sky-300 hover:underline">
                No edge pieces left — show all
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
