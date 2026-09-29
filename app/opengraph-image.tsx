import { ImageResponse } from "next/og";

export const alt = "LeaveCtrl — Leave & Workforce Availability";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

function MatrixMark() {
  const cells = [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 30px)",
        gridTemplateRows: "repeat(3, 30px)",
        gap: "10px",
      }}
    >
      {cells.map(([x, y]) => {
        const centre = x === 1 && y === 1;
        const partial = x === 2 && y === 2;

        return (
          <div
            key={`${x}-${y}`}
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              border: centre ? "2px solid #008080" : "2px solid #B8C4C7",
              background: centre ? "#008080" : "#FFFFFF",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {partial ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  width: 18,
                  height: 18,
                  background: "#008080",
                  clipPath: "polygon(100% 0,100% 100%,0 100%)",
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F6F9F9",
          color: "#17212B",
          padding: "72px 82px",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid #DCE5E5",
            borderRadius: 34,
            background: "#FFFFFF",
            padding: "58px 64px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <MatrixMark />
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                fontSize: 64,
                fontWeight: 800,
                letterSpacing: "-3px",
              }}
            >
              <span style={{ color: "#17212B" }}>Leave</span>
              <span style={{ color: "#008080" }}>Ctrl</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
            <div
              style={{
                fontSize: 22,
                letterSpacing: "3px",
                textTransform: "uppercase",
                color: "#66778A",
                fontWeight: 700,
              }}
            >
              Leave & workforce availability
            </div>
            <div
              style={{
                fontSize: 54,
                lineHeight: 1.08,
                letterSpacing: "-2.2px",
                fontWeight: 760,
                maxWidth: 900,
              }}
            >
              Simple leave control for modern teams.
            </div>
            <div
              style={{
                fontSize: 24,
                lineHeight: 1.45,
                color: "#66778A",
                maxWidth: 920,
              }}
            >
              Leave, availability, approvals and TOIL in one calm operational workspace.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 19,
              color: "#66778A",
            }}
          >
            <span>leavectrl.co.za</span>
            <span style={{ color: "#008080", fontWeight: 700 }}>Workforce clarity, without the clutter.</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
