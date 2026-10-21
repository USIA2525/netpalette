export function LiveCursors({ cursors, clientID }: { cursors: Map<number, any>, clientID: number }) {
  return (
    <>
      {Array.from(cursors.entries()).map(([id, state]) => {
        // 自分自身のカーソル、または座標データがない場合は描画しない
        if (id === clientID || !state?.cursor) return null;

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: state.cursor.x,
              top: state.cursor.y,
              pointerEvents: 'none',
              zIndex: 9999,
              transition: 'left 0.1s linear, top 0.1s linear' // スムーズなカーソル移動
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5.65376 21.5L2.5 2.5L21.5 10.9634L13.1465 13.5654L10.874 21.1118L5.65376 21.5Z" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
            </svg>
            <div style={{
              background: '#f59e0b', color: 'white', padding: '2px 8px',
              borderRadius: '12px', fontSize: '12px', marginTop: '2px', fontWeight: 'bold'
            }}>
              {state.user?.name || `User ${id.toString().slice(-3)}`}
            </div>
          </div>
        );
      })}
    </>
  );
}